/**
 * 触觉反馈封装。
 * Capacitor: @capacitor/haptics 插件
 * Harmony: 鸿蒙振动由系统 UI 控件自动处理，JS 层 no-op
 * Web: 静默降级（no-op）
 */

import { getPlatform } from "./platform";

/** 滑动超过阈值时 — 轻触反馈 */
export async function hapticsImpactLight(): Promise<void> {
  if (getPlatform() !== "capacitor") return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics 插件不可用，静默跳过
  }
}

/** 完成操作 — 成功反馈 */
export async function hapticsNotifySuccess(): Promise<void> {
  if (getPlatform() !== "capacitor") return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // 静默跳过
  }
}

/** 删除/警告操作 — 警告反馈 */
export async function hapticsNotifyWarning(): Promise<void> {
  if (getPlatform() !== "capacitor") return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // 静默跳过
  }
}
