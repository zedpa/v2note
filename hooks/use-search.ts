"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { NoteItem } from "@/lib/types";

export function useSearch() {
  const [results, setResults] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const deviceId = await getDeviceId();
      const searchTerm = `%${q.trim()}%`;

      // Search in summaries and transcripts
      const { data: records, error } = await supabase
        .from("record")
        .select(`
          id,
          status,
          duration_seconds,
          location_text,
          created_at,
          summary!inner (title, short_summary),
          record_tag (tag:tag_id (name))
        `)
        .eq("device_id", deviceId)
        .eq("status", "completed")
        .or(`title.ilike.${searchTerm},short_summary.ilike.${searchTerm}`, {
          referencedTable: "summary",
        })
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const items: NoteItem[] = (records ?? []).map((r: any) => {
        const summary = Array.isArray(r.summary) ? r.summary[0] : r.summary;
        const tags = (r.record_tag ?? [])
          .map((rt: any) => rt.tag?.name ?? "")
          .filter(Boolean);

        const dt = new Date(r.created_at);
        const date = `${dt.getMonth() + 1}月${dt.getDate()}日`;
        const time = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

        return {
          id: r.id,
          title: summary?.title ?? "",
          short_summary: summary?.short_summary ?? "",
          tags,
          date,
          time,
          location: r.location_text,
          status: r.status,
          duration_seconds: r.duration_seconds,
          created_at: r.created_at,
        };
      });

      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, query, search };
}
