"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { Soul } from "@/shared/lib/types";
import { getSoul, updateSoul as apiUpdateSoul } from "@/shared/lib/api/soul";
import { fabNotify } from "@/shared/lib/fab-notify";

export function useSoul() {
  const [soul, setSoul] = useState<Soul | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await getDeviceId();
        const data = await getSoul();
        if (!cancelled) setSoul(data);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const updateSoul = useCallback(async (content: string) => {
    setSaving(true);
    try {
      await apiUpdateSoul(content);
      setSoul((prev) =>
        prev
          ? { ...prev, content, updated_at: new Date().toISOString() }
          : { id: "", device_id: "", content, updated_at: new Date().toISOString() },
      );
      fabNotify.info("AI 人格已更新");
    } catch {
      fabNotify.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, []);

  return { soul, loading, saving, updateSoul };
}
