import { describe, it, expect, beforeEach } from "vitest";

describe("harmony-bridge — getHarmonyBridge()", () => {
  beforeEach(() => {
    delete (window as any).__harmony_bridge__;
  });

  it("should_return_bridge_object_when_harmony_bridge_injected", async () => {
    const mockBridge = {
      device: { getId: async () => "test-id", getInfo: async () => ({ platform: "harmony" as const, model: "test", osVersion: "5.0" }) },
      audio: { requestPermission: async () => true, start: async () => {}, stop: async () => ({ base64: "", mimeType: "audio/aac", duration: 0 }), getStatus: async () => "idle" as const },
      preferences: { get: async () => null, set: async () => {}, remove: async () => {} },
      statusBar: { init: async () => {} },
      notification: { schedule: async () => {}, cancel: async () => {}, cancelAll: async () => {} },
      safeArea: { getInsets: async () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
      system: { openUrl: async () => {}, getVersion: async () => "1.0.0" },
    };
    (window as any).__harmony_bridge__ = mockBridge;

    const { getHarmonyBridge } = await import("../harmony-bridge");
    const bridge = getHarmonyBridge();
    expect(bridge).toBe(mockBridge);
  });

  it("should_return_null_when_harmony_bridge_not_injected", async () => {
    const { getHarmonyBridge } = await import("../harmony-bridge");
    const bridge = getHarmonyBridge();
    expect(bridge).toBeNull();
  });
});

describe("harmony-bridge — type exports", () => {
  it("should_export_HarmonyBridge_type_and_getHarmonyBridge_function", async () => {
    const mod = await import("../harmony-bridge");
    expect(typeof mod.getHarmonyBridge).toBe("function");
  });
});
