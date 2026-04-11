import { describe, it, expect, vi, beforeEach } from "vitest";

// 测试 device.ts 中 harmony 分支和 crypto.randomUUID polyfill

describe("device — harmony 分支", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
  });

  it("should_use_harmony_bridge_for_device_id_when_harmony_platform", async () => {
    // 设置 harmony 环境
    const mockBridge = {
      device: {
        getId: vi.fn().mockResolvedValue("harmony-device-123"),
        getInfo: vi.fn().mockResolvedValue({ platform: "harmony", model: "Mate60", osVersion: "5.0" }),
      },
    };
    (window as any).__harmony_bridge__ = mockBridge;

    // Mock API 调用（lookupDevice/registerDevice）
    vi.doMock("../api/device", () => ({
      lookupDevice: vi.fn().mockResolvedValue({ id: "db-device-id-1" }),
      registerDevice: vi.fn(),
    }));
    vi.doMock("../api", () => ({
      setApiDeviceId: vi.fn(),
    }));

    const { getDeviceId, clearDeviceCache } = await import("../device");
    clearDeviceCache();

    const id = await getDeviceId();
    expect(id).toBe("db-device-id-1");
    expect(mockBridge.device.getId).toHaveBeenCalled();

    delete (window as any).__harmony_bridge__;
  });

  it("should_fallback_to_web_when_harmony_bridge_fails", async () => {
    // harmony bridge 存在但抛错
    const mockBridge = {
      device: {
        getId: vi.fn().mockRejectedValue(new Error("bridge error")),
      },
    };
    (window as any).__harmony_bridge__ = mockBridge;

    vi.doMock("../api/device", () => ({
      lookupDevice: vi.fn().mockResolvedValue({ id: "db-device-web" }),
      registerDevice: vi.fn(),
    }));
    vi.doMock("../api", () => ({
      setApiDeviceId: vi.fn(),
    }));

    const { getDeviceId, clearDeviceCache } = await import("../device");
    clearDeviceCache();

    const id = await getDeviceId();
    // 应该降级到 web fallback，不抛错
    expect(id).toBe("db-device-web");

    delete (window as any).__harmony_bridge__;
  });
});

describe("device — crypto.randomUUID polyfill", () => {
  it("should_generate_valid_uuid_when_crypto_randomUUID_unavailable", async () => {
    vi.resetModules();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;

    // 移除 randomUUID 但保留 getRandomValues
    const origRandomUUID = crypto.randomUUID;
    // @ts-ignore
    crypto.randomUUID = undefined;

    vi.doMock("../api/device", () => ({
      lookupDevice: vi.fn().mockResolvedValue(null),
      registerDevice: vi.fn().mockImplementation((_id: string, _p: string) => ({ id: "new-dev" })),
    }));
    vi.doMock("../api", () => ({
      setApiDeviceId: vi.fn(),
    }));

    try {
      const { getDeviceId, clearDeviceCache } = await import("../device");
      clearDeviceCache();
      localStorage.removeItem("voicenote:deviceIdentifier");

      const id = await getDeviceId();
      expect(id).toBe("new-dev");
    } finally {
      crypto.randomUUID = origRandomUUID;
    }
  });
});
