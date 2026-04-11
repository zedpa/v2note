import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("platform — getPlatform()", () => {
  let originalWindow: any;

  beforeEach(() => {
    // 每个测试前重置模块缓存，确保重新执行模块代码
    vi.resetModules();
  });

  it("should_return_web_when_window_is_undefined (SSR)", async () => {
    // 模拟 SSR：typeof window === 'undefined'
    const origWindow = globalThis.window;
    // @ts-ignore
    delete globalThis.window;
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("web");
    } finally {
      globalThis.window = origWindow;
    }
  });

  it("should_return_harmony_when_harmony_bridge_exists", async () => {
    (window as any).__harmony_bridge__ = { device: {} };
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("harmony");
    } finally {
      delete (window as any).__harmony_bridge__;
    }
  });

  it("should_return_capacitor_when_capacitor_native", async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("capacitor");
    } finally {
      delete (window as any).Capacitor;
    }
  });

  it("should_return_electron_when_electron_preload_exists", async () => {
    (window as any).__electron_preload__ = true;
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("electron");
    } finally {
      delete (window as any).__electron_preload__;
    }
  });

  it("should_return_web_when_no_native_markers", async () => {
    // 确保没有任何原生标记
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
    delete (window as any).__electron_preload__;
    const { getPlatform } = await import("../platform");
    expect(getPlatform()).toBe("web");
  });

  it("should_prioritize_harmony_over_capacitor_when_both_exist", async () => {
    (window as any).__harmony_bridge__ = { device: {} };
    (window as any).Capacitor = { isNativePlatform: () => true };
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("harmony");
    } finally {
      delete (window as any).__harmony_bridge__;
      delete (window as any).Capacitor;
    }
  });

  it("should_return_web_when_capacitor_exists_but_not_native", async () => {
    (window as any).Capacitor = { isNativePlatform: () => false };
    try {
      const { getPlatform } = await import("../platform");
      expect(getPlatform()).toBe("web");
    } finally {
      delete (window as any).Capacitor;
    }
  });
});

describe("platform — isNativePlatform()", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
    delete (window as any).__electron_preload__;
  });

  it("should_return_true_when_harmony", async () => {
    (window as any).__harmony_bridge__ = { device: {} };
    const { isNativePlatform } = await import("../platform");
    expect(isNativePlatform()).toBe(true);
    delete (window as any).__harmony_bridge__;
  });

  it("should_return_true_when_capacitor", async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    const { isNativePlatform } = await import("../platform");
    expect(isNativePlatform()).toBe(true);
    delete (window as any).Capacitor;
  });

  it("should_return_false_when_web", async () => {
    const { isNativePlatform } = await import("../platform");
    expect(isNativePlatform()).toBe(false);
  });

  it("should_return_false_when_electron", async () => {
    (window as any).__electron_preload__ = true;
    const { isNativePlatform } = await import("../platform");
    expect(isNativePlatform()).toBe(false);
    delete (window as any).__electron_preload__;
  });
});
