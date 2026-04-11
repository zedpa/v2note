import { describe, it, expect, vi, beforeEach } from "vitest";

describe("status-bar — harmony 分支", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
  });

  it("should_call_harmony_bridge_statusBar_init_when_harmony_platform", async () => {
    const mockInit = vi.fn().mockResolvedValue(undefined);
    (window as any).__harmony_bridge__ = {
      statusBar: { init: mockInit },
    };

    const { initStatusBar } = await import("../status-bar");
    await initStatusBar();

    expect(mockInit).toHaveBeenCalledWith({
      backgroundColor: "#f8f5f0",
      style: "dark",
    });

    delete (window as any).__harmony_bridge__;
  });

  it("should_not_throw_when_harmony_bridge_statusBar_unavailable", async () => {
    // harmony bridge 存在但没有 statusBar
    (window as any).__harmony_bridge__ = { device: {} };

    const { initStatusBar } = await import("../status-bar");
    // 不应抛错
    await expect(initStatusBar()).resolves.toBeUndefined();

    delete (window as any).__harmony_bridge__;
  });

  it("should_use_capacitor_when_capacitor_platform", async () => {
    // Mock Capacitor
    const mockSetOverlays = vi.fn().mockResolvedValue(undefined);
    const mockSetBgColor = vi.fn().mockResolvedValue(undefined);
    const mockSetStyle = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
    }));
    vi.doMock("@capacitor/status-bar", () => ({
      StatusBar: {
        setOverlaysWebView: mockSetOverlays,
        setBackgroundColor: mockSetBgColor,
        setStyle: mockSetStyle,
      },
      Style: { Default: "DEFAULT" },
    }));

    (window as any).Capacitor = { isNativePlatform: () => true };

    const { initStatusBar } = await import("../status-bar");
    await initStatusBar();

    expect(mockSetBgColor).toHaveBeenCalled();
    delete (window as any).Capacitor;
  });

  it("should_silently_return_when_web_platform", async () => {
    const { initStatusBar } = await import("../status-bar");
    // Web 环境下不应抛错，静默返回
    await expect(initStatusBar()).resolves.toBeUndefined();
  });
});
