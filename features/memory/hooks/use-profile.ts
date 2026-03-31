"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getProfile,
  updateProfile as apiUpdateProfile,
  type UserProfile,
} from "@/shared/lib/api/profile";
import { fabNotify } from "@/shared/lib/fab-notify";

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getProfile();
        if (!cancelled) setProfile(data);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const updateProfile = useCallback(async (content: string) => {
    setSaving(true);
    try {
      await apiUpdateProfile(content);
      setProfile((prev) =>
        prev
          ? { ...prev, content, updated_at: new Date().toISOString() }
          : { device_id: "", content, updated_at: new Date().toISOString() },
      );
      fabNotify.info("用户画像已更新");
    } catch {
      fabNotify.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, loading, saving, updateProfile };
}
