/**
 * StatusBar initialization for native platforms.
 * Uses dynamic import to avoid crashes in browser dev mode.
 */
export async function initStatusBar(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import("@capacitor/status-bar");

    const platform = Capacitor.getPlatform();
    if (platform === "ios") {
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
