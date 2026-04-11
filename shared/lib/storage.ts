/**
 * Cross-platform key-value storage.
 * 三级 fallback: harmony → capacitor → localStorage
 */

import { getPlatform } from "./platform";
import { getHarmonyBridge } from "./harmony-bridge";

type StorageBackend = "harmony" | "capacitor" | "web";

function getBackend(): StorageBackend {
  const platform = getPlatform();
  if (platform === "harmony") {
    const bridge = getHarmonyBridge();
    if (bridge?.preferences) return "harmony";
  }
  if (platform === "capacitor") return "capacitor";
  return "web";
}

export async function getItem(key: string): Promise<string | null> {
  const backend = getBackend();

  if (backend === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      return (await bridge?.preferences?.get(key)) ?? null;
    } catch {
      return localStorage.getItem(key);
    }
  }

  if (backend === "capacitor") {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value;
  }

  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  const backend = getBackend();

  if (backend === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      await bridge?.preferences?.set(key, value);
      return;
    } catch {
      localStorage.setItem(key, value);
      return;
    }
  }

  if (backend === "capacitor") {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    return;
  }

  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  const backend = getBackend();

  if (backend === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      await bridge?.preferences?.remove(key);
      return;
    } catch {
      localStorage.removeItem(key);
      return;
    }
  }

  if (backend === "capacitor") {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
    return;
  }

  localStorage.removeItem(key);
}
