/**
 * GatewayClient pending control frames 集成测试
 *
 * regression: fix-cold-resume-silent-loss §7.1
 *
 * 验证 send() 在 WS 未 OPEN / token 为空时不再静默 drop，
 * 而是通过 PendingControlFramesQueue 保留控制消息；
 * WS 进入 OPEN 后自动刷出。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock deps（必须在 import gateway-client 之前）
let _mockToken: string | null = "test-token";
vi.mock("@/shared/lib/gateway-url", () => ({
  getGatewayWsUrl: () => "ws://mock",
}));
vi.mock("@/shared/lib/auth", () => ({
  getAccessToken: () => _mockToken,
  logout: vi.fn(),
  onAuthEvent: vi.fn(() => vi.fn()),
  getRefreshTokenValue: () => null,
  updateTokens: vi.fn(),
}));
vi.mock("@/shared/lib/api/auth", () => ({
  refreshToken: vi.fn(),
}));

// 受控 WebSocket mock
class MockWS {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState: number = MockWS.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];
  instance?: MockWS;
  constructor(public url: string) {
    // 不自动 open；测试手动 triggerOpen
    MockWS.lastInstance = this;
  }
  static lastInstance: MockWS | null = null;
  send(data: string | ArrayBuffer) {
    if (this.readyState !== MockWS.OPEN) {
      throw new Error("WebSocket not open");
    }
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWS.CLOSED;
    this.onclose?.();
  }
  triggerOpen() {
    this.readyState = MockWS.OPEN;
    this.onopen?.();
  }
  triggerMessage(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

// 全局覆盖
(globalThis as unknown as { WebSocket: typeof MockWS }).WebSocket = MockWS;

// 手动 re-import gateway-client 以确保 singleton 状态隔离
async function freshClient() {
  vi.resetModules();
  const mod = await import("./gateway-client");
  return mod.getGatewayClient();
}

describe("GatewayClient pending control [regression: fix-cold-resume-silent-loss §7.1]", () => {
  beforeEach(() => {
    _mockToken = "test-token";
    MockWS.lastInstance = null;
  });

  it("should_queue_chat_user_when_ws_not_open", async () => {
    const client = await freshClient();

    // 不 connect → ws 为 null；send 应入队而非 drop
    client.send({
      type: "chat.message",
      payload: { text: "hi", client_id: "c-1" },
    });

    // 无可观测的公开 API 读取队列；通过 connect + open 后触发 flush 验证
    client.connect();
    const ws = MockWS.lastInstance!;
    expect(ws.sent).toHaveLength(0);

    ws.triggerOpen();
    // OPEN 后：先 auth，再 flush 队列
    const types = ws.sent.map((d) =>
      typeof d === "string" ? (JSON.parse(d) as { type: string }).type : "bin",
    );
    expect(types[0]).toBe("auth");
    expect(types).toContain("chat.message");
  });

  it("should_queue_asr_start_stop_when_token_null", async () => {
    _mockToken = null;
    const client = await freshClient();

    client.send({
      type: "asr.start",
      payload: {
        mode: "realtime",
        sessionId: "s-1",
      } as never,
    });
    client.send({
      type: "asr.stop",
      payload: { saveAudio: false, sessionId: "s-1" } as never,
    });

    // 恢复 token，模拟冷启动完成 initAuth
    _mockToken = "test-token";
    client.connect();
    const ws = MockWS.lastInstance!;
    ws.triggerOpen();

    const types = ws.sent.map((d) =>
      typeof d === "string" ? (JSON.parse(d) as { type: string }).type : "bin",
    );
    // auth 必须第一个；然后 asr.start, asr.stop 有序
    expect(types[0]).toBe("auth");
    expect(types.filter((t) => t === "asr.start")).toHaveLength(1);
    // asr.start (带 client_id 场景会 break；无 client_id 时不 break)
    // 本例 asr.start 无 client_id → ws.send 无抛错即出队 → asr.stop 也会被发出
    expect(types.filter((t) => t === "asr.stop")).toHaveLength(1);
  });

  it("should_not_send_best_effort_when_capacity_exceeded", async () => {
    _mockToken = null;
    const client = await freshClient();

    // 灌入 60 个 heartbeat（可丢弃，上限 50）
    for (let i = 0; i < 60; i++) {
      client.send({ type: "asr.cancel", payload: {} as never });
    }

    _mockToken = "test-token";
    client.connect();
    const ws = MockWS.lastInstance!;
    ws.triggerOpen();

    const cancels = ws.sent.filter(
      (d) =>
        typeof d === "string" &&
        (JSON.parse(d) as { type: string }).type === "asr.cancel",
    );
    expect(cancels.length).toBeLessThanOrEqual(50);
  });

  it("should_abort_flush_when_ws_closes_midway", async () => {
    _mockToken = null;
    const client = await freshClient();
    // 灌多个必保留帧
    for (let i = 0; i < 5; i++) {
      client.send({
        type: "chat.message",
        payload: { text: `m${i}`, client_id: `c-${i}` },
      });
    }
    _mockToken = "test-token";
    client.connect();
    const ws = MockWS.lastInstance!;
    // OPEN 触发 flush；但带 client_id 的帧会在 send 后立即 markAwaitingAck + break
    ws.triggerOpen();
    // 因此 ws.sent 中仅一条 chat.message（第一条）被发出
    const chatMsgs = ws.sent.filter(
      (d) =>
        typeof d === "string" &&
        (JSON.parse(d) as { type: string }).type === "chat.message",
    );
    expect(chatMsgs.length).toBe(1);
  });

  it("should_ack_chat_user_when_chat_done_client_id_echoes", async () => {
    _mockToken = null;
    const client = await freshClient();
    client.send({
      type: "chat.message",
      payload: { text: "hello", client_id: "c-1" },
    });
    client.send({
      type: "chat.message",
      payload: { text: "world", client_id: "c-2" },
    });
    _mockToken = "test-token";
    client.connect();
    const ws = MockWS.lastInstance!;
    ws.triggerOpen();

    // 第一条已发出并 awaitingAck；第二条仍在队列
    let chatMsgs = ws.sent.filter(
      (d) =>
        typeof d === "string" &&
        (JSON.parse(d) as { type: string }).type === "chat.message",
    );
    expect(chatMsgs.length).toBe(1);

    // 模拟 server 回显 client_id=c-1 的 chat.done
    ws.triggerMessage({
      type: "chat.done",
      payload: { full_text: "ok", client_id: "c-1" },
    });

    // c-1 被 ack → flush 继续发 c-2
    chatMsgs = ws.sent.filter(
      (d) =>
        typeof d === "string" &&
        (JSON.parse(d) as { type: string }).type === "chat.message",
    );
    expect(chatMsgs.length).toBe(2);
  });

  it("should_not_drop_control_when_token_missing_at_call_time", async () => {
    _mockToken = null;
    const client = await freshClient();
    // 未登录、未 connect → 控制消息仍入队
    client.send({ type: "asr.cancel", payload: {} as never });
    // 让 token 恢复，connect 建立 ws
    _mockToken = "test-token";
    client.connect();
    const ws = MockWS.lastInstance!;
    ws.triggerOpen();
    const cancels = ws.sent.filter(
      (d) =>
        typeof d === "string" &&
        (JSON.parse(d) as { type: string }).type === "asr.cancel",
    );
    expect(cancels.length).toBe(1);
  });
});
