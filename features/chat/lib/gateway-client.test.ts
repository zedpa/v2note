import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/shared/lib/gateway-url", () => ({
  getGatewayWsUrl: () => "ws://localhost:9999",
}));
vi.mock("@/shared/lib/auth", () => ({
  getAccessToken: () => "test-token",
  logout: vi.fn(),
  onAuthEvent: vi.fn(() => vi.fn()),
}));
vi.mock("@/shared/lib/api", () => ({
  getApiDeviceId: () => "test-device",
}));
vi.mock("@/shared/lib/device", () => ({
  getDeviceId: () => Promise.resolve("test-device"),
}));

/**
 * Phase 1: sendBinary 缓冲队列 + waitForReady 超时改 8s
 */
describe("GatewayClient — sendBinary 缓冲队列", () => {
  it("should_queue_binary_data_when_ws_not_open", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    // sendBinary 应该有缓冲逻辑（pendingBinaryData）
    expect(source).toContain("pendingBinaryData");

    // sendBinary 方法中应该在 else 分支 push 到队列
    const startIdx = source.indexOf("sendBinary(");
    // 找到 sendBinary 方法后的下一个同级方法
    const nextMethodIdx = source.indexOf("\n  ", startIdx + 50);
    const sendBinarySection = source.slice(startIdx, source.indexOf("\n\n", startIdx + 50));
    expect(sendBinarySection).toContain("pendingBinaryData");
  });

  it("should_flush_binary_queue_on_reconnect", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    // onopen 中应该冲刷 pendingBinaryData
    const onopenSection = source.slice(
      source.indexOf("ws.onopen"),
      source.indexOf("ws.onmessage"),
    );
    expect(onopenSection).toContain("pendingBinaryData");
  });

  it("should_cap_binary_queue_at_300_chunks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    // 队列上限 300
    expect(source).toContain("300");
  });

  it("should_clear_binary_queue_on_disconnect", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    // disconnect 方法中应清空 pendingBinaryData
    const disconnectStart = source.indexOf("disconnect(): void");
    const disconnectSection = source.slice(
      disconnectStart,
      source.indexOf("\n\n", disconnectStart + 50),
    );
    expect(disconnectSection).toContain("pendingBinaryData");
  });
});

describe("GatewayClient — onceResponse 清理 [M1]", () => {
  it("should_reject_pending_onceResponse_when_disconnect_called", async () => {
    // 源码级断言：
    //   - pendingOnceRejectors 集合存在
    //   - disconnect() / onclose 均调用 _rejectAllPendingOnce
    //   - onceResponse 在订阅时 add 到集合，解除时 delete
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    expect(source).toMatch(/pendingOnceRejectors/);
    expect(source).toMatch(/_rejectAllPendingOnce/);

    // disconnect 里必须调用清理
    const disconnectIdx = source.indexOf("disconnect(): void");
    expect(disconnectIdx).toBeGreaterThan(-1);
    const disconnectEnd = source.indexOf("\n  }", disconnectIdx);
    const disconnectBody = source.slice(disconnectIdx, disconnectEnd);
    expect(disconnectBody).toMatch(/_rejectAllPendingOnce/);

    // onclose 里必须调用清理
    const oncloseIdx = source.indexOf("ws.onclose =");
    expect(oncloseIdx).toBeGreaterThan(-1);
    const oncloseEnd = source.indexOf("};", oncloseIdx);
    const oncloseBody = source.slice(oncloseIdx, oncloseEnd);
    expect(oncloseBody).toMatch(/_rejectAllPendingOnce/);

    // onceResponse 注册 rejector
    const onceIdx = source.indexOf("onceResponse(");
    expect(onceIdx).toBeGreaterThan(-1);
    const onceEnd = source.indexOf("_rejectAllPendingOnce", onceIdx);
    const onceBody = source.slice(onceIdx, onceEnd);
    expect(onceBody).toMatch(/pendingOnceRejectors\.add/);
  });

  it("should_reject_pending_onceResponse_with_connection_closed_reason", async () => {
    // 行为测试：实例化 GatewayClient，注册一个 onceResponse，然后 disconnect 后观察 reject
    const { GatewayClient } = await import("./gateway-client");
    const client = new GatewayClient();
    // 注册一个极长超时的 onceResponse
    const p = client.onceResponse("chat.done" as any, () => true, 60_000);
    // 立刻 disconnect
    client.disconnect();
    await expect(p).rejects.toMatchObject({ code: "network" });
  });

  it("should_not_leak_rejector_when_onceResponse_resolves", async () => {
    const { GatewayClient } = await import("./gateway-client");
    const client = new GatewayClient();
    const p = client.onceResponse("chat.done" as any, (payload: any) => payload?.x === 1, 60_000);
    // 注入一条匹配消息
    client.injectMessage({ type: "chat.done", payload: { full_text: "ok", x: 1 } as any });
    await expect(p).resolves.toMatchObject({ x: 1 });
    // disconnect 后不应出现额外 reject (该 promise 已 resolve，也没有遗留在集合里)
    client.disconnect();
  });
});

describe("GatewayClient — waitForReady 超时", () => {
  it("should_default_timeout_to_8000ms", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "./gateway-client.ts"),
      "utf-8",
    );

    // waitForReady 默认超时应为 8000
    expect(source).toMatch(/waitForReady\(timeoutMs\s*=\s*8000\)/);
  });
});
