/**
 * WebSocket client for the Dialog Gateway.
 * Handles connection, message sending, and event dispatching.
 */

export interface LocalConfigPayload {
  soul?: { content: string };
  skills?: {
    configs: Array<{
      name: string;
      enabled: boolean;
      description?: string;
      type?: "review" | "process";
      prompt?: string;
      builtin?: boolean;
    }>;
    selectedReviewSkill?: string;
  };
  settings?: Record<string, unknown>;
  existingTags?: string[];
}

export type GatewayMessage =
  | { type: "auth"; payload: { token: string } }
  | { type: "process"; payload: { text: string; recordId?: string; sourceContext?: string; localConfig?: LocalConfigPayload } }
  | {
      type: "chat.start";
      payload: {
        mode: "review" | "command" | "insight";
        dateRange: { start: string; end: string };
        initialMessage?: string;
        assistantPreamble?: string;
        skill?: string;
        localConfig?: Pick<LocalConfigPayload, "soul" | "skills">;
      };
    }
  | { type: "chat.message"; payload: { text: string; client_id?: string } }
  | { type: "chat.end"; payload: Record<string, never> }
  | { type: "todo.aggregate"; payload: Record<string, never> }
  | { type: "asr.start"; payload: { locationText?: string; mode?: "realtime" | "upload"; notebook?: string; sourceContext?: "todo" | "timeline" | "chat" | "review"; saveAudio?: boolean } }
  | { type: "asr.stop"; payload: { saveAudio?: boolean; forceCommand?: boolean } }
  | { type: "asr.cancel"; payload: Record<string, never> }
  | { type: "plan.confirm"; payload: { planId: string; action: "execute_all" | "execute_modified" | "abandon"; modifications?: Array<{ stepIndex: number; description?: string; deleted?: boolean }> } }
  | { type: "todo.refine"; payload: { commands: any[]; modificationText: string } };

export type GatewayResponse =
  | { type: "process.result"; payload: Record<string, unknown> }
  | { type: "chat.chunk"; payload: { text: string; client_id?: string } }
  | { type: "chat.done"; payload: { full_text: string; text?: string; client_id?: string; cached?: boolean } }
  | { type: "todo.result"; payload: { diary_entry: string } }
  | { type: "asr.partial"; payload: { text: string; sentenceId: number } }
  | { type: "asr.sentence"; payload: { text: string; sentenceId: number; begin_time: number; end_time: number } }
  | { type: "asr.done"; payload: { transcript: string; recordId: string; duration: number } }
  | { type: "asr.error"; payload: { message: string } }
  | { type: "command.detected"; payload: { command: string; args: string[] } }
  | { type: "proactive.message"; payload: { text: string; action?: string } }
  | { type: "proactive.todo_nudge"; payload: { todoId: string; text: string; suggestion: string } }
  | { type: "proactive.morning_briefing"; payload: { text: string } }
  | { type: "proactive.relay_reminder"; payload: { text: string; count: number } }
  | { type: "proactive.evening_summary"; payload: { text: string } }
  | { type: "tool.step"; payload: { stepIndex: number; totalSteps: number; toolName: string; status: string; result?: string } }
  | { type: "tool.status"; payload: { toolName: string; label: string; callId: string } }
  | { type: "tool.done"; payload: { toolName: string; callId: string; success: boolean; message: string; durationMs: number } }
  | { type: "plan.proposed"; payload: { planId: string; intent: string; steps: Array<{ index: number; description: string; toolName?: string; needsConfirm?: boolean }> } }
  | { type: "plan.step_done"; payload: { planId: string; stepIndex: number; status: string; result?: string } }
  | { type: "plan.done"; payload: { planId: string; status: string } }
  | { type: "todo.created"; payload: { todoId: string; text: string } }
  | { type: "error"; payload: { message: string } };

type MessageHandler = (msg: GatewayResponse) => void;

/**
 * WS 状态订阅（Phase 7 §5.2）：
 * - connecting: ws 正在建立中
 * - open:       ws 已就绪
 * - closed:     ws 未连 / 已断 / 重连失败
 */
export type GatewayWsStatus = "connecting" | "open" | "closed";
type StatusHandler = (s: GatewayWsStatus) => void;

import { getGatewayWsUrl } from "@/shared/lib/gateway-url";
import { getAccessToken, logout as authLogout, onAuthEvent } from "@/shared/lib/auth";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 3000;

/** 尝试通过 REST 刷新 token，成功返回 true */
async function tryRefreshForWs(): Promise<boolean> {
  try {
    const auth = await import("@/shared/lib/auth");
    const rt = auth.getRefreshTokenValue();
    if (!rt) return false;
    const { refreshToken } = await import("@/shared/lib/api/auth");
    const result = await refreshToken(rt);
    await auth.updateTokens(result.accessToken, result.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;
  private _connectPromise: Promise<void> | null = null;
  private pendingMessages: GatewayMessage[] = [];
  private pendingBinaryData: ArrayBuffer[] = [];
  private reconnectAttempts = 0;
  private _authRefreshing = false;
  private _unsubAuthLogout: (() => void) | null = null;
  /**
   * M1: 所有 pending onceResponse 的 reject 回调集合。
   * disconnect()/onclose 时统一 reject 为 "connection closed" 错误，
   * 避免 pushChatUserMsg 等调用者悬挂到超时。
   */
  private pendingOnceRejectors: Set<(e: { code: string; message: string }) => void> = new Set();
  /** Phase 7 §5.2：ws 状态订阅（sync-status-banner 使用） */
  private statusHandlers: Set<StatusHandler> = new Set();

  get connected(): boolean {
    return this._connected;
  }

  /** Phase 7 §5.2：当前 ws 状态（供 banner 轮询/初始化读取） */
  getStatus(): GatewayWsStatus {
    if (!this.ws) return "closed";
    if (this.ws.readyState === WebSocket.OPEN) return "open";
    if (this.ws.readyState === WebSocket.CONNECTING) return "connecting";
    return "closed";
  }

  /** Phase 7 §5.2：订阅 ws 状态变化 */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  private _emitStatus(s: GatewayWsStatus): void {
    for (const h of this.statusHandlers) {
      try {
        h(s);
      } catch {
        // swallow handler errors
      }
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;
    // Manual connect resets retry counter
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts = 0;
    }

    // 监听被动登出事件 → 立即断开，不再重连
    if (!this._unsubAuthLogout) {
      this._unsubAuthLogout = onAuthEvent("auth:logout", () => {
        console.log("[gateway-client] Auth logout detected, disconnecting");
        this.disconnect();
      });
    }

    this._connectPromise = new Promise<void>((resolve) => {
      try {
        this.ws = new WebSocket(getGatewayWsUrl());
        this._emitStatus("connecting");

        this.ws.onopen = () => {
          this._connected = true;
          this.reconnectAttempts = 0;
          console.log("[gateway-client] Connected");
          this._emitStatus("open");

          // Send auth message if logged in
          const token = getAccessToken();

          if (token && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: "auth",
              payload: { token },
            }));
            // Flush pending messages after auth
            for (const pending of this.pendingMessages) {
              this.ws?.send(JSON.stringify(pending));
            }
            this.pendingMessages = [];
            // Flush pending binary data (PCM chunks queued during disconnect)
            for (const chunk of this.pendingBinaryData) {
              this.ws?.send(chunk);
            }
            this.pendingBinaryData = [];
          } else if (!token) {
            // 无 token = 未登录，禁止使用 WebSocket，丢弃 pending 消息并断开
            console.warn("[gateway-client] No access token, closing unauthenticated connection");
            this.pendingMessages = [];
            this.ws?.close();
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: GatewayResponse = JSON.parse(event.data);

            // 处理 gateway 认证失败：尝试刷新 token 后重连
            if (msg.type === "error" && (
              msg.payload?.message === "Authentication failed" ||
              msg.payload?.message === "Not authenticated"
            )) {
              console.warn("[gateway-client] Auth rejected by gateway, attempting token refresh...");
              this._handleAuthFailure();
              return;
            }

            for (const handler of this.handlers) {
              handler(msg);
            }
          } catch {
            console.error("[gateway-client] Failed to parse message");
          }
        };

        this.ws.onclose = () => {
          this._connected = false;
          this._connectPromise = null;
          console.log("[gateway-client] Disconnected");
          this._emitStatus("closed");
          // M1: 统一清理 pending onceResponse（如 chat.done 等待者）
          this._rejectAllPendingOnce({
            code: "network",
            message: "connection closed",
          });
          // Auto-reconnect with exponential backoff
          if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, Math.min(this.reconnectAttempts, 5));
            this.reconnectAttempts++;
            console.log(`[gateway-client] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
          } else {
            console.log("[gateway-client] Max reconnect attempts reached, stopping");
          }
        };

        this.ws.onerror = () => {
          this._connected = false;
          resolve(); // resolve even on error to unblock waiters
        };
      } catch {
        this._connected = false;
        resolve();
      }
    });
  }

  /** Wait until WebSocket is open (with timeout). */
  async waitForReady(timeoutMs = 8000): Promise<boolean> {
    if (this._connected) return true;
    if (!this._connectPromise) this.connect();
    const timeout = new Promise<void>((r) => setTimeout(r, timeoutMs));
    await Promise.race([this._connectPromise, timeout]);
    return this._connected;
  }

  send(msg: GatewayMessage): void {
    // 未登录时拒绝发送任何消息（auth 消息由 connect 内部处理）
    if (!getAccessToken()) {
      console.warn("[gateway-client] Not authenticated, message dropped");
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingMessages.push(msg);
      console.warn("[gateway-client] Not connected, message queued");
    }
  }

  /** Send binary data (e.g. PCM audio chunks). Queues if WS not open. */
  sendBinary(data: ArrayBuffer): void {
    if (!getAccessToken()) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      // 缓冲二进制数据，上限 300 块（约 30 秒 @ 100ms/块）
      if (this.pendingBinaryData.length >= 300) {
        this.pendingBinaryData.shift(); // FIFO 丢弃最早的块
      }
      this.pendingBinaryData.push(data);
      console.warn("[gateway-client] Binary queued, WS not open");
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** 注入模拟消息（e2e 测试用） */
  injectMessage(msg: GatewayResponse): void {
    for (const handler of this.handlers) {
      handler(msg);
    }
  }

  /**
   * 一次性监听：等待首条符合 (type + filter) 的响应消息，带超时。
   *
   * regression: fix-cold-resume-silent-loss (Phase 5)
   * 用于 capture-push.ts 的 chat_user_msg 推送流：发送 chat.message 后
   * 订阅 chat.done（按 client_id 过滤），收到即视为"成功投递"。
   *
   * 返回 payload；超时抛 { code: "push_timeout", message }。
   */
  onceResponse(
    type: GatewayResponse["type"],
    filter: (payload: any) => boolean,
    timeoutMs: number,
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let unsub: (() => void) | null = null;
      // M1: 注册本 pending 的 rejector，disconnect/onclose 能统一清理
      const rejectWrapper = (e: { code: string; message: string }) => {
        clearTimeout(timer);
        unsub?.();
        this.pendingOnceRejectors.delete(rejectWrapper);
        reject(e);
      };
      this.pendingOnceRejectors.add(rejectWrapper);

      const timer = setTimeout(() => {
        unsub?.();
        this.pendingOnceRejectors.delete(rejectWrapper);
        reject({ code: "push_timeout", message: `onceResponse(${type}) timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      unsub = this.onMessage((msg) => {
        if (msg.type !== type) return;
        try {
          if (!filter((msg as any).payload)) return;
        } catch {
          return;
        }
        clearTimeout(timer);
        unsub?.();
        this.pendingOnceRejectors.delete(rejectWrapper);
        resolve((msg as any).payload);
      });
    });
  }

  /**
   * M1: 统一 reject 所有 pending onceResponse（连接关闭时调用）。
   * 避免 pushChatUserMsg 挂到 10s 超时，让 sync-orchestrator 更快感知失败并重试。
   */
  private _rejectAllPendingOnce(reason: { code: string; message: string }): void {
    const rejectors = Array.from(this.pendingOnceRejectors);
    this.pendingOnceRejectors.clear();
    for (const r of rejectors) {
      try {
        r(reason);
      } catch {
        // swallow
      }
    }
  }

  /**
   * 重置重连退避计数
   *
   * regression: fix-cold-resume-silent-loss §4.1
   * 由 sync-orchestrator 的 ensureGatewaySession 调用：
   * 长时间未用后，reconnectAttempts 可能已耗尽 → 重置后 connect() 才能真正重试。
   */
  resetReconnectBackoff(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.pendingMessages = [];
    this.pendingBinaryData = [];
    this.reconnectAttempts = 0;
    this._emitStatus("closed");
    // M1: 统一 reject 所有 pending onceResponse（如 chat.done 等待者），
    // 避免调用方挂到超时。
    this._rejectAllPendingOnce({
      code: "network",
      message: "connection closed",
    });
    // 清理 auth 事件监听
    this._unsubAuthLogout?.();
    this._unsubAuthLogout = null;
  }

  /**
   * Gateway 返回 "Authentication failed" 时：
   * 1. 尝试 REST 刷新 token
   * 2. 成功 → 重新发送 auth 消息（复用当前连接）
   * 3. 失败 → 触发 auth:logout 并断开
   */
  private async _handleAuthFailure(): Promise<void> {
    if (this._authRefreshing) return;
    this._authRefreshing = true;
    try {
      const refreshed = await tryRefreshForWs();
      if (refreshed) {
        // token 刷新成功，重新发送 auth 消息
        const token = getAccessToken();
        if (token && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: "auth",
            payload: { token },
          }));
          console.log("[gateway-client] Re-authenticated with refreshed token");
        }
      } else {
        // refresh 也失败，用户需要重新登录
        console.warn("[gateway-client] Token refresh failed, forcing logout");
        await authLogout("ws_auth_failed");
        this.disconnect();
      }
    } catch (err: any) {
      console.error("[gateway-client] Auth failure handling error:", err.message);
      await authLogout("ws_auth_failed");
      this.disconnect();
    } finally {
      this._authRefreshing = false;
    }
  }
}

// Singleton instance
let instance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!instance) {
    instance = new GatewayClient();
    // 暴露到 window 以便 e2e 测试注入消息
    if (typeof window !== "undefined") {
      (window as any).__gatewayClient = instance;
    }
  }
  return instance;
}

