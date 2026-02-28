/**
 * WebSocket client for the Dialog Gateway.
 * Handles connection, message sending, and event dispatching.
 */

export interface LocalConfigPayload {
  soul?: { content: string };
  skills?: { configs: Array<{ name: string; enabled: boolean }> };
  settings?: Record<string, unknown>;
  existingTags?: string[];
}

export type GatewayMessage =
  | { type: "process"; payload: { text: string; deviceId: string; recordId: string; localConfig?: LocalConfigPayload } }
  | {
      type: "chat.start";
      payload: {
        deviceId: string;
        mode: "review" | "command";
        dateRange: { start: string; end: string };
        initialMessage?: string;
        localConfig?: Pick<LocalConfigPayload, "soul" | "skills">;
      };
    }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string } }
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
  | { type: "error"; payload: { message: string } };

type MessageHandler = (msg: GatewayResponse) => void;

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3001";

export class GatewayClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(GATEWAY_URL);

      this.ws.onopen = () => {
        this._connected = true;
        console.log("[gateway-client] Connected");
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
        console.log("[gateway-client] Disconnected");
        // Auto-reconnect after 3 seconds
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch {
      this._connected = false;
    }
  }

  send(msg: GatewayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[gateway-client] Not connected, message dropped");
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
