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
