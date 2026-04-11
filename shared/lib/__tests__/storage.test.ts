import { describe, it, expect, vi, beforeEach } from "vitest";

describe("storage — harmony 分支", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
  });

  it("should_use_harmony_bridge_for_getItem_when_harmony_platform", async () => {
    const mockPrefs = {
      get: vi.fn().mockResolvedValue("harmony-value"),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    (window as any).__harmony_bridge__ = { preferences: mockPrefs };

    const storage = await import("../storage");
    const result = await storage.getItem("test-key");

    expect(result).toBe("harmony-value");
    expect(mockPrefs.get).toHaveBeenCalledWith("test-key");
  });

  it("should_use_harmony_bridge_for_setItem_when_harmony_platform", async () => {
    const mockPrefs = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(),
    };
    (window as any).__harmony_bridge__ = { preferences: mockPrefs };

    const storage = await import("../storage");
    await storage.setItem("key1", "val1");

    expect(mockPrefs.set).toHaveBeenCalledWith("key1", "val1");
  });

  it("should_use_harmony_bridge_for_removeItem_when_harmony_platform", async () => {
    const mockPrefs = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    (window as any).__harmony_bridge__ = { preferences: mockPrefs };

    const storage = await import("../storage");
    await storage.removeItem("key1");

    expect(mockPrefs.remove).toHaveBeenCalledWith("key1");
  });

  it("should_fallback_to_localStorage_when_web_platform", async () => {
    // 确保无原生标记
    const storage = await import("../storage");

    await storage.setItem("web-key", "web-val");
    expect(localStorage.getItem("web-key")).toBe("web-val");

    const result = await storage.getItem("web-key");
    expect(result).toBe("web-val");

    await storage.removeItem("web-key");
    expect(localStorage.getItem("web-key")).toBeNull();
  });

  it("should_fallback_to_localStorage_when_harmony_bridge_has_no_preferences", async () => {
    // harmony bridge 存在但没有 preferences
    (window as any).__harmony_bridge__ = { device: {} };

    const storage = await import("../storage");
    await storage.setItem("fallback-key", "fallback-val");

    // 应该降级到 localStorage
    expect(localStorage.getItem("fallback-key")).toBe("fallback-val");
  });
});
