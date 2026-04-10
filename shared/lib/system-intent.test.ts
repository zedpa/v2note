import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * system-intent.ts 单元测试
 * 测试 TypeScript 封装层：Web no-op 降级
 */

// Mock @capacitor/core — 默认模拟 Web 环境（非原生）
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
  registerPlugin: vi.fn(() => ({
    insertCalendarEvent: vi.fn(() => Promise.resolve()),
    setAlarm: vi.fn(() => Promise.resolve()),
  })),
}));

describe("system-intent — 场景 1.3: Web 平台降级", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_export_SystemIntent_with_insertCalendarEvent_and_setAlarm", async () => {
    const mod = await import("./system-intent");
    const SystemIntent = mod.default;
    expect(SystemIntent).toBeDefined();
    expect(typeof SystemIntent.insertCalendarEvent).toBe("function");
    expect(typeof SystemIntent.setAlarm).toBe("function");
  });

  it("should_resolve_insertCalendarEvent_as_noop_when_not_native", async () => {
    const mod = await import("./system-intent");
    const SystemIntent = mod.default;
    await expect(
      SystemIntent.insertCalendarEvent({
        title: "测试事件",
        beginTime: Date.now(),
        endTime: Date.now() + 3600000,
      }),
    ).resolves.toBeUndefined();
  });

  it("should_resolve_setAlarm_as_noop_when_not_native", async () => {
    const mod = await import("./system-intent");
    const SystemIntent = mod.default;
    await expect(
      SystemIntent.setAlarm({ hour: 9, minutes: 0, message: "测试闹钟" }),
    ).resolves.toBeUndefined();
  });

  it("should_not_call_registerPlugin_when_not_native", async () => {
    const { registerPlugin } = await import("@capacitor/core");
    // 重新 import 触发模块执行
    await import("./system-intent");
    expect(registerPlugin).not.toHaveBeenCalled();
  });
});
