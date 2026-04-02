/**
 * Capacitor 触觉反馈封装。
 * 非原生环境静默降级（no-op）。
 */

/** 滑动超过阈值时 — 轻触反馈 */
export async function hapticsImpactLight(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Capacitor 或 Haptics 插件不可用，静默跳过
  }
}

/** 完成操作 — 成功反馈 */
export async function hapticsNotifySuccess(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // 静默跳过
  }
}

/** 删除/警告操作 — 警告反馈 */
export async function hapticsNotifyWarning(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // 静默跳过
  }
}
