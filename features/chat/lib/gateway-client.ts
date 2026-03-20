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
  | { type: "process"; payload: { text: string; deviceId: string; recordId: string; localConfig?: LocalConfigPayload } }
  | {
      type: "chat.start";
      payload: {
        deviceId: string;
        mode: "review" | "command" | "insight";
        dateRange: { start: string; end: string };
        initialMessage?: string;
        assistantPreamble?: string;
        localConfig?: Pick<LocalConfigPayload, "soul" | "skills">;
      };
    }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string; mode?: "realtime" | "upload"; notebook?: string } }
  | { type: "asr.stop"; payload: { deviceId: string; saveAudio?: boolean } }
  | { type: "asr.cancel"; payload: { deviceId: string } };

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
  | { type: "error"; payload: { message: string } };

type MessageHandler = (msg: GatewayResponse) => void;

import { getGatewayWsUrl } from "@/shared/lib/gateway-url";
import { getAccessToken } from "@/shared/lib/auth";
import { getApiDeviceId } from "@/shared/lib/api";
import { getDeviceId } from "@/shared/lib/device";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 3000;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;
  private _connectPromise: Promise<void> | null = null;
  private pendingMessages: GatewayMessage[] = [];
  private reconnectAttempts = 0;

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
            resolve();
          };

          if (token && deviceId) {
            sendAuth(deviceId);
          } else if (token) {
            // deviceId not yet initialized — fetch it, then send auth
            getDeviceId()
              .then((did) => sendAuth(did))
              .catch(() => {
                // Even if device lookup fails, flush pending and resolve
                if (this.pendingMessages.length > 0) {
                  for (const pending of this.pendingMessages) {
                    this.ws?.send(JSON.stringify(pending));
                  }
                  this.pendingMessages = [];
                }
                resolve();
              });
          } else {
            // No token — not logged in, just flush pending
            if (this.pendingMessages.length > 0) {
              for (const pending of this.pendingMessages) {
                this.ws?.send(JSON.stringify(pending));
              }
              this.pendingMessages = [];
            }
            resolve();
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: GatewayResponse = JSON.parse(event.data);
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
  async waitForReady(timeoutMs = 5000): Promise<boolean> {
    if (this._connected) return true;
    if (!this._connectPromise) this.connect();
    const timeout = new Promise<void>((r) => setTimeout(r, timeoutMs));
    await Promise.race([this._connectPromise, timeout]);
    return this._connected;
  }

  send(msg: GatewayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingMessages.push(msg);
      console.warn("[gateway-client] Not connected, message queued");
    }
  }

  /** Send binary data (e.g. PCM audio chunks) */
  sendBinary(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
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
    this.reconnectAttempts = 0;
  }
}

// Singleton instance
let instance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!instance) {
    instance = new GatewayClient();
  }
  return instance;
}

