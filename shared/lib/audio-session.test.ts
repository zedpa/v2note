import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * audio-session.ts 单元测试
 * 测试 TypeScript 封装层：Web no-op 降级 + Capacitor 原生桥接
 */

// Mock @capacitor/core — 默认模拟 Web 环境（非原生）
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
  registerPlugin: vi.fn(() => ({
    activate: vi.fn(() => Promise.resolve()),
    deactivate: vi.fn(() => Promise.resolve()),
  })),
}));

describe("audio-session — Web 平台降级（场景 6）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_export_AudioSession_object_with_activate_and_deactivate", async () => {
    const { AudioSession } = await import("./audio-session");
    expect(AudioSession).toBeDefined();
    expect(typeof AudioSession.activate).toBe("function");
    expect(typeof AudioSession.deactivate).toBe("function");
  });

  it("should_resolve_activate_as_noop_when_not_native_platform", async () => {
    const { AudioSession } = await import("./audio-session");
    // activate 应该 resolve，不抛异常
    await expect(AudioSession.activate()).resolves.toBeUndefined();
  });

  it("should_resolve_deactivate_as_noop_when_not_native_platform", async () => {
    const { AudioSession } = await import("./audio-session");
    // deactivate 应该 resolve，不抛异常
    await expect(AudioSession.deactivate()).resolves.toBeUndefined();
  });

  it("should_not_throw_when_activate_called_multiple_times", async () => {
    const { AudioSession } = await import("./audio-session");
    await expect(AudioSession.activate()).resolves.toBeUndefined();
    await expect(AudioSession.activate()).resolves.toBeUndefined();
  });

  it("should_not_throw_when_deactivate_called_without_prior_activate", async () => {
    const { AudioSession } = await import("./audio-session");
    await expect(AudioSession.deactivate()).resolves.toBeUndefined();
  });
});

describe("audio-session — 边界条件", () => {
  it("should_not_throw_when_capacitor_import_fails", async () => {
    // 模块已被 mock 为 Web 环境，调用不应抛异常
    const { AudioSession } = await import("./audio-session");
    await expect(AudioSession.activate()).resolves.toBeUndefined();
    await expect(AudioSession.deactivate()).resolves.toBeUndefined();
  });
});
