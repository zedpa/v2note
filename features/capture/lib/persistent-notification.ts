/**
 * Persistent Notification Bridge — Spec #131 Phase A1
 *
 * TypeScript 封装 Android PersistentNotificationPlugin。
 * 在非 Android 环境下静默降级（no-op）。
 */

import { Capacitor } from "@capacitor/core";

interface PersistentNotificationPlugin {
  show(): Promise<void>;
  hide(): Promise<void>;
  isActive(): Promise<{ active: boolean }>;
}

/** 获取原生插件实例，非 Android 返回 null */
function getPlugin(): PersistentNotificationPlugin | null {
  if (Capacitor.getPlatform() !== "android") return null;
  try {
    // Capacitor 8 本地插件通过 registerPlugin 注册，通过 Capacitor.Plugins 访问
    const plugins = (Capacitor as any).Plugins;
    return plugins?.PersistentNotification ?? null;
  } catch {
    return null;
  }
}

/** 显示常驻通知（仅 Android） */
export async function showQuickCaptureNotification(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.show();
}

/** 隐藏常驻通知（仅 Android） */
export async function hideQuickCaptureNotification(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.hide();
}

/** 查询通知是否活跃（仅 Android，其他平台返回 false） */
export async function isQuickCaptureNotificationActive(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  const result = await plugin.isActive();
  return result.active;
}
