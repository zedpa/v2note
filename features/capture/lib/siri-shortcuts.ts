/**
 * Siri Shortcuts Bridge — Spec #131 Phase C
 *
 * TypeScript 封装 iOS SiriShortcutsPlugin。
 * 在非 iOS 环境下静默降级（no-op）。
 */

import { Capacitor } from "@capacitor/core";

interface ShortcutItem {
  activityType: string;
  title: string;
  suggestedPhrase?: string;
  urlToOpen?: string;
}

interface SiriShortcutsPluginApi {
  donate(options: ShortcutItem): Promise<{ donated: boolean }>;
  donateMultiple(options: { items: ShortcutItem[] }): Promise<{ donated: boolean; count: number }>;
  isAvailable(): Promise<{ available: boolean }>;
}

/** 获取原生插件实例，非 iOS 返回 null */
function getPlugin(): SiriShortcutsPluginApi | null {
  if (Capacitor.getPlatform() !== "ios") return null;
  try {
    const plugins = (Capacitor as any).Plugins; // eslint-disable-line @typescript-eslint/no-explicit-any
    return plugins?.SiriShortcuts ?? null;
  } catch {
    return null;
  }
}

/** 检查 Siri Shortcuts 是否可用 */
export async function isSiriShortcutsAvailable(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  const result = await plugin.isAvailable();
  return result.available;
}

/** 一次性捐献所有快捷方式（批量提交，避免 setShortcutSuggestions 覆盖） */
export async function donateAllShortcuts(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.donateMultiple({
    items: [
      {
        activityType: "com.v2note.app.captureVoice",
        title: "念念录一条",
        suggestedPhrase: "念念录一条",
        urlToOpen: "v2note://capture/voice?source=ios_shortcut",
      },
      {
        activityType: "com.v2note.app.captureText",
        title: "念念写一条",
        suggestedPhrase: "念念写一条",
        urlToOpen: "v2note://capture/text?source=ios_shortcut",
      },
    ],
  });
}
