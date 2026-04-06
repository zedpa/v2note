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
  | { type: "auth"; payload: { token: string; deviceId: string } }
  | { type: "process"; payload: { text: string; deviceId: string; recordId?: string; sourceContext?: string; localConfig?: LocalConfigPayload } }
  | {
      type: "chat.start";
      payload: {
        deviceId: string;
        mode: "review" | "command" | "insight";
        dateRange: { start: string; end: string };
        initialMessage?: string;
        assistantPreamble?: string;
        skill?: string;
        localConfig?: Pick<LocalConfigPayload, "soul" | "skills">;
      };
    }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string; mode?: "realtime" | "upload"; notebook?: string; sourceContext?: "todo" | "timeline" | "chat" | "review"; saveAudio?: boolean } }
  | { type: "asr.stop"; payload: { deviceId: string; saveAudio?: boolean; forceCommand?: boolean } }
  | { type: "asr.cancel"; payload: { deviceId: string } }
  | { type: "plan.confirm"; payload: { deviceId: string; planId: string; action: "execute_all" | "execute_modified" | "abandon"; modifications?: Array<{ stepIndex: number; description?: string; deleted?: boolean }> } }
  | { type: "todo.refine"; payload: { deviceId: string; commands: any[]; modificationText: string } };

export type GatewayResponse =
  | { type: "process.result"; payload: Record<string, unknown> }
  | { type: "chat.chunk"; payload: { text: string } }
  | { type: "chat.done"; payload: { full_text: string } }
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
  | { type: "reflect.question"; payload: { question: string } }
  | { type: "ai.status"; payload: { text: string } }
  | { type: "tool.step"; payload: { stepIndex: number; totalSteps: number; toolName: string; status: string; result?: string } }
  | { type: "tool.status"; payload: { toolName: string; label: string; callId: string } }
  | { type: "tool.done"; payload: { toolName: string; callId: string; success: boolean; message: string; durationMs: number } }
  | { type: "plan.proposed"; payload: { planId: string; intent: string; steps: Array<{ index: number; description: string; toolName?: string; needsConfirm?: boolean }> } }
  | { type: "plan.step_done"; payload: { planId: string; stepIndex: number; status: string; result?: string } }
  | { type: "plan.done"; payload: { planId: string; status: string } }
  | { type: "todo.created"; payload: { todoId: string; text: string } }
  | { type: "error"; payload: { message: string } };

type MessageHandler = (msg: GatewayResponse) => void;

import { getGatewayWsUrl } from "@/shared/lib/gateway-url";
import { getAccessToken, logout as authLogout, onAuthEvent } from "@/shared/lib/auth";
import { getApiDeviceId } from "@/shared/lib/api";
import { getDeviceId } from "@/shared/lib/device";

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

  get connected(): boolean {
    return this._connected;
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

        this.ws.onopen = () => {
          this._connected = true;
          this.reconnectAttempts = 0;
          console.log("[gateway-client] Connected");

          // Send auth message if logged in.
          // getApiDeviceId() may be null on app reopen (only set during
          // login() or getDeviceId()). Fall back to async getDeviceId()
          // so the WebSocket is always authenticated.
          const token = getAccessToken();
          let deviceId = getApiDeviceId();

          const sendAuth = (did: string) => {
            if (token && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: "auth",
                payload: { token, deviceId: did },
              }));
            }
            // Flush pending messages after auth
            if (this.pendingMessages.length > 0) {
              for (const pending of this.pendingMessages) {
                this.ws?.send(JSON.stringify(pending));
              }
              this.pendingMessages = [];
            }
            // Flush pending binary data (PCM chunks queued during disconnect)
            if (this.pendingBinaryData.length > 0) {
              for (const chunk of this.pendingBinaryData) {
                this.ws?.send(chunk);
              }
              this.pendingBinaryData = [];
            }
            resolve();
          };

          if (token && deviceId) {
            sendAuth(deviceId);
          } else if (token) {
            // deviceId not yet initialized — fetch it, then send auth
            getDeviceId()
              .then((did) => sendAuth(did))
              .catch(() => {
                // device lookup 失败，无法认证，丢弃 pending 并断开
                console.warn("[gateway-client] No deviceId available, cannot authenticate");
                this.pendingMessages = [];
                resolve();
              });
          } else {
            // 无 token = 未登录，禁止使用 WebSocket，丢弃 pending 消息并断开
            console.warn("[gateway-client] No access token, closing unauthenticated connection");
            this.pendingMessages = [];
            this.ws?.close();
            resolve();
          }
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
        const deviceId = getApiDeviceId() ?? await getDeviceId();
        if (token && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: "auth",
            payload: { token, deviceId },
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

