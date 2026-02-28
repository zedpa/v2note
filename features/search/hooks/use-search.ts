"use client";

import { useState, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { NoteItem } from "@/shared/lib/types";
import { searchRecords } from "@/shared/lib/api/records";

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
      await getDeviceId(); // ensure API deviceId is set

      const records = await searchRecords(q.trim());

      const items: NoteItem[] = records.map((r: any) => {
        const dt = new Date(r.created_at);
        const date = `${dt.getMonth() + 1}月${dt.getDate()}日`;
        const time = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

        return {
          id: r.id,
          title: r.summary?.title ?? "",
          short_summary: r.summary?.short_summary ?? "",
          tags: [],
          date,
          time,
          location: r.location_text,
          status: r.status,
          duration_seconds: r.duration_seconds,
          audio_path: r.audio_path ?? null,
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
