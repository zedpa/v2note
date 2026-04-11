import { registerDevice, lookupDevice } from "./api/device";
import { setApiDeviceId } from "./api";
import { getPlatform } from "./platform";
import { getHarmonyBridge } from "./harmony-bridge";

let cachedDeviceId: string | null = null;
let pendingPromise: Promise<string> | null = null;

/**
 * crypto.randomUUID polyfill（兼容鸿蒙 WebView 等不支持的环境）
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Polyfill: 使用 crypto.getRandomValues 生成 UUID v4
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 设置 version (4) 和 variant (10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getDeviceIdentifier(): Promise<{ identifier: string; platform: string }> {
  const platform = getPlatform();

  // 鸿蒙分支：通过 JSBridge 获取设备 ID
  if (platform === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      if (bridge?.device?.getId) {
        const id = await bridge.device.getId();
        return { identifier: id, platform: "harmony" };
      }
    } catch {
      // harmony bridge 失败，降级到 web fallback
    }
  }

  // Capacitor 分支（保持原有逻辑不变）
  if (platform === "capacitor") {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Device } = await import("@capacitor/device");
        const idResult = await Device.getId();
        const info = await Device.getInfo();
        return { identifier: idResult.identifier, platform: info.platform };
      }
    } catch {
      // Capacitor not available
    }
  }

  // Web fallback: generate and persist a random device ID
  const STORAGE_KEY = "voicenote:deviceIdentifier";
  let identifier = localStorage.getItem(STORAGE_KEY);
  if (!identifier) {
    identifier = `web-${generateUUID()}`;
    localStorage.setItem(STORAGE_KEY, identifier);
  }
  return { identifier, platform: "web" };
}

/**
 * Get the device ID. Looks up existing device first, registers if not found.
 * The device will be linked to a user during login/register.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // 并发锁：多个组件同时调用时复用同一个 Promise，避免重复注册
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    const { identifier, platform } = await getDeviceIdentifier();

    // Try to find existing device
    const existing = await lookupDevice(identifier);
    if (existing) {
      cachedDeviceId = existing.id;
      setApiDeviceId(existing.id);
      return existing.id;
    }

    // Register new device (will be linked to user during auth)
    const created = await registerDevice(identifier, platform);
    cachedDeviceId = created.id;
    setApiDeviceId(created.id);
    return created.id;
  })().finally(() => {
    pendingPromise = null;
  });

  return pendingPromise;
}

export function clearDeviceCache() {
  cachedDeviceId = null;
}
