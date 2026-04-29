/**
 * Floating Capture Bridge — Spec #131 Phase B
 *
 * TypeScript 封装 Android FloatingCapturePlugin。
 * 在非 Android 环境下静默降级（no-op）。
 */

import { Capacitor } from "@capacitor/core";

interface FloatingCapturePluginApi {
  startBubble(): Promise<void>;
  stopBubble(): Promise<void>;
  isBubbleActive(): Promise<{ active: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
  addListener(
    event: string,
    callback: (data: Record<string, unknown>) => void,
  ): Promise<{ remove: () => void }>;
}

/** 获取原生插件实例，非 Android 返回 null */
function getPlugin(): FloatingCapturePluginApi | null {
  if (Capacitor.getPlatform() !== "android") return null;
  try {
    const plugins = (Capacitor as any).Plugins; // eslint-disable-line @typescript-eslint/no-explicit-any
    return plugins?.FloatingCapture ?? null;
  } catch {
    return null;
  }
}

/** 启动悬浮气泡（仅 Android，需 SYSTEM_ALERT_WINDOW 权限） */
export async function startFloatingBubble(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.startBubble();
}

/** 停止悬浮气泡 */
export async function stopFloatingBubble(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.stopBubble();
}

/** 查询气泡是否活跃 */
export async function isFloatingBubbleActive(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  const result = await plugin.isBubbleActive();
  return result.active;
}

/** 检查悬浮窗权限 */
export async function checkOverlayPermission(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  const result = await plugin.checkOverlayPermission();
  return result.granted;
}

/** 请求悬浮窗权限（跳转系统设置页） */
export async function requestOverlayPermission(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.requestOverlayPermission();
}

/** 监听录音完成事件 */
export async function onRecordingComplete(
  callback: (data: { pcmFilePath: string; durationMs: number }) => void,
): Promise<{ remove: () => void } | null> {
  const plugin = getPlugin();
  if (!plugin) return null;
  return plugin.addListener(
    "recordingComplete",
    callback as (data: Record<string, unknown>) => void,
  );
}

/** 监听气泡状态变化 */
export async function onBubbleStateChanged(
  callback: (data: { state: "idle" | "recording" | "processing" | "done" }) => void,
): Promise<{ remove: () => void } | null> {
  const plugin = getPlugin();
  if (!plugin) return null;
  return plugin.addListener(
    "bubbleStateChanged",
    callback as (data: Record<string, unknown>) => void,
  );
}
