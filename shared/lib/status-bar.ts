/**
 * StatusBar initialization for native platforms.
 * 三级 fallback: harmony → capacitor → 静默返回
 */
import { getPlatform } from "./platform";
import { getHarmonyBridge } from "./harmony-bridge";

export async function initStatusBar(): Promise<void> {
  const platform = getPlatform();

  // 鸿蒙分支：通过 JSBridge 设置状态栏
  if (platform === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      if (bridge?.statusBar?.init) {
        await bridge.statusBar.init({
          backgroundColor: "#f8f5f0",
          style: "dark",
        });
      }
    } catch {
      // 鸿蒙状态栏不可用 — 静默忽略
    }
    return;
  }

  // Capacitor 分支（保持原有逻辑不变）
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import("@capacitor/status-bar");

    const capPlatform = Capacitor.getPlatform();
    if (capPlatform === "ios") {
      // iOS: overlay + transparent, safe-area-inset-top works
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#00000000" });
    } else {
      // Android: don't overlay — env(safe-area-inset-top) returns 0
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: "#f8f5f0" });
    }
    await StatusBar.setStyle({ style: Style.Default });
  } catch {
    // StatusBar not available — ignore
  }
}
