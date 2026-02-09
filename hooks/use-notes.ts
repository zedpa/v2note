"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { NoteItem } from "@/lib/types";

interface DateGroup {
  date: string;
  notes: NoteItem[];
}

export function useNotes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const deviceId = await getDeviceId();

      const { data: records, error: err } = await supabase
        .from("record")
        .select(`
          id,
          status,
          duration_seconds,
          location_text,
          created_at,
          summary (title, short_summary),
          record_tag (tag:tag_id (name))
        `)
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });

      if (err) throw err;

      const items: NoteItem[] = (records ?? []).map((r: any) => {
        const summary = Array.isArray(r.summary) ? r.summary[0] : r.summary;
        const tags = (r.record_tag ?? []).map(
          (rt: any) => rt.tag?.name ?? "",
        ).filter(Boolean);

        const dt = new Date(r.created_at);
        const date = `${dt.getMonth() + 1}月${dt.getDate()}日`;
        const time = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

        return {
          id: r.id,
          title: summary?.title ?? "处理中...",
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

      setNotes(items);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const groupByDate = useCallback((): DateGroup[] => {
    const groups: DateGroup[] = [];
    for (const note of notes) {
      const existing = groups.find((g) => g.date === note.date);
      if (existing) {
        existing.notes.push(note);
      } else {
        groups.push({ date: note.date, notes: [note] });
      }
    }
    return groups;
  }, [notes]);

  return { notes, loading, error, refetch: fetchNotes, groupByDate };
}
