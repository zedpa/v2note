/**
 * App update checker + OTA hot-update service.
 * All Capacitor imports are lazy to support web fallback.
 */

import { getGatewayHttpUrl } from "./gateway-url";

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
  let platform = "android";
  let versionCode = 0;
  let versionName = "1.0.0";

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;

    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    versionName = info.version; // e.g. "1.2.0"
    versionCode = parseInt(info.build, 10) || 0; // e.g. "3" -> 3
    const { Device } = await import("@capacitor/device");
    const devInfo = await Device.getInfo();
    platform = devInfo.platform;
  } catch {
    // Not on native — skip update check
    return null;
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
