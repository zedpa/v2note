"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import { on } from "@/lib/events";

export function useTags() {
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();

      const { data, error } = await supabase
        .from("record_tag")
        .select("tag:tag_id (name), record:record_id (device_id)")
        .filter("record.device_id", "eq", deviceId);

      if (error) throw error;

      const names = new Set<string>();
      for (const row of data ?? []) {
        const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const record = Array.isArray(row.record) ? row.record[0] : row.record;
        if (record?.device_id === deviceId && tag?.name) {
          names.add(tag.name);
        }
      }

      setTags(Array.from(names).sort());
    } catch {
      // silently fail — tags are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
    const unsub = on("recording:processed", fetchTags);
    return unsub;
  }, [fetchTags]);

  return { tags, loading, refetch: fetchTags };
}
