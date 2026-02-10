"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { IdeaItem } from "@/lib/types";

export function useIdeas() {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      setLoading(true);
      const deviceId = await getDeviceId();

      const { data, error: err } = await supabase
        .from("idea")
        .select(`
          id,
          text,
          record_id,
          created_at,
          record:record_id (
            device_id,
            summary (title)
          )
        `)
        .order("created_at", { ascending: false });

      if (err) throw err;

      const items: IdeaItem[] = (data ?? [])
        .filter((t: any) => {
          const record = Array.isArray(t.record) ? t.record[0] : t.record;
          return record?.device_id === deviceId;
        })
        .map((t: any) => {
          const record = Array.isArray(t.record) ? t.record[0] : t.record;
          const summary = record?.summary;
          const title = Array.isArray(summary) ? summary[0]?.title : summary?.title;
          return {
            id: t.id,
            text: t.text,
            source: title ?? null,
            record_id: t.record_id,
            created_at: t.created_at,
          };
        });

      setIdeas(items);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load ideas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  return { ideas, loading, error, refetch: fetchIdeas };
}
