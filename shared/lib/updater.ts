/**
 * App update checker + OTA hot-update service.
 * Capacitor: APK + OTA (@capgo/capacitor-updater)
 * Harmony: AppGallery 商店更新（Phase 1）
 * Web: no-op
 * All Capacitor imports are lazy to support web/harmony fallback.
 */

import { getGatewayHttpUrl } from "./gateway-url";
import { getPlatform } from "./platform";
import { getHarmonyBridge } from "./harmony-bridge";

export interface UpdateInfo {
  type: "apk" | "ota";
  version: string;
  versionCode: number;
  bundleUrl: string;
  changelog: string | null;
  isMandatory: boolean;
  fileSize: number | null;
  checksum: string | null;
}

export interface CheckResult {
  apk: UpdateInfo | null;
  ota: UpdateInfo | null;
}

function mapRelease(raw: any, type: "apk" | "ota"): UpdateInfo | null {
  if (!raw) return null;
  return {
    type,
    version: raw.version,
    versionCode: raw.version_code,
    bundleUrl: raw.bundle_url ?? "",
    changelog: raw.changelog,
    isMandatory: raw.is_mandatory,
    fileSize: raw.file_size,
    checksum: raw.checksum,
  };
}

/**
 * Check for available updates (both APK and OTA).
 * Returns null if no updates or not on native platform.
 */
export async function checkForUpdate(): Promise<CheckResult | null> {
  const currentPlatform = getPlatform();

  // Web / Electron 不检查更新
  if (currentPlatform !== "capacitor" && currentPlatform !== "harmony") return null;

  let platform = "android";
  let versionCode = 0;
  let versionName = "1.0.0";

  // 鸿蒙分支：通过 JSBridge 获取版本号
  if (currentPlatform === "harmony") {
    try {
      const bridge = getHarmonyBridge();
      if (bridge?.system?.getVersion) {
        versionName = await bridge.system.getVersion() || "1.0.0";
      }
      platform = "harmony";
    } catch {
      return null;
    }
  } else {
    // Capacitor 分支（原有逻辑不变）
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      versionName = info.version;
      versionCode = parseInt(info.build, 10) || 0;
      const { Device } = await import("@capacitor/device");
      const devInfo = await Device.getInfo();
      platform = devInfo.platform;
    } catch {
      return null;
    }
  }

  try {
    const base = getGatewayHttpUrl();
    const params = new URLSearchParams({
      platform,
      currentVersionCode: String(versionCode),
      nativeVersion: versionName,
    });
    const res = await fetch(`${base}/api/v1/releases/check?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const apk = mapRelease(data.apk, "apk");
    const ota = mapRelease(data.ota, "ota");

    if (!apk && !ota) return null;
    return { apk, ota };
  } catch {
    return null;
  }
}

/**
 * Download and apply OTA bundle using @capgo/capacitor-updater.
 */
export async function applyOtaUpdate(update: UpdateInfo): Promise<void> {
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");

  // Build full URL if relative
  let url = update.bundleUrl;
  if (url.startsWith("/")) {
    url = getGatewayHttpUrl() + url;
  }

  const bundle = await CapacitorUpdater.download({
    url,
    version: update.version,
  });

  await CapacitorUpdater.set(bundle);
}

/**
 * Open APK download URL in external browser.
 */
export async function openApkDownload(url: string): Promise<void> {
  try {
    // @capacitor/browser may not be installed — use dynamic import with fallback
    const mod = await import(/* webpackIgnore: true */ "@capacitor/browser" as any);
    await mod.Browser.open({ url });
  } catch {
    window.open(url, "_blank");
  }
}
