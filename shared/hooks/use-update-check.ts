import { useState, useEffect, useCallback } from "react";
import type { CheckResult, UpdateInfo } from "../lib/updater";

export function useUpdateCheck() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { checkForUpdate } = await import("../lib/updater");
        const res = await checkForUpdate();
        if (!cancelled && res) {
          setResult(res);

          // Auto-apply OTA if available (silent update)
          if (res.ota) {
            setApplying(true);
            try {
              const { applyOtaUpdate } = await import("../lib/updater");
              await applyOtaUpdate(res.ota);
              // reload happens automatically via capacitor-updater
            } catch (err) {
              console.error("[updater] OTA apply failed:", err);
              setApplying(false);
            }
          }
        }
      } catch {
        // Silently fail — update check is non-critical
      }
    }

    // Delay check by 3s to not block app startup
    const timer = setTimeout(check, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  // Only surface APK update to UI (OTA is silent)
  const apkUpdate: UpdateInfo | null = (!dismissed && result?.apk) ? result.apk : null;

  return { update: apkUpdate, dismiss, applying };
}
