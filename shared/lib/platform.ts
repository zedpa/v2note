/**
 * 平台检测层 — 三级 fallback: harmony → capacitor → web
 * 检测顺序：window.__harmony_bridge__ → Capacitor.isNativePlatform() → __electron_preload__ → web
 * SSR 安全：typeof window === 'undefined' 时返回 'web'
 */

export type Platform = "web" | "capacitor" | "electron" | "harmony";

export function getPlatform(): Platform {
  if (typeof window === "undefined") return "web"; // SSR
  if ((window as any).__harmony_bridge__) return "harmony";
  if ((window as any).Capacitor?.isNativePlatform?.()) return "capacitor";
  if ((window as any).__electron_preload__) return "electron";
  return "web";
}

/** harmony 或 capacitor 算 native */
export function isNativePlatform(): boolean {
  const p = getPlatform();
  return p === "capacitor" || p === "harmony";
}
