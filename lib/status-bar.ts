/**
 * StatusBar initialization for native platforms.
 * Uses dynamic import to avoid crashes in browser dev mode.
 */
export async function initStatusBar(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#00000000" });
    await StatusBar.setStyle({ style: Style.Default });
  } catch {
    // StatusBar not available — ignore
  }
}
