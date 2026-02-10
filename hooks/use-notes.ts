"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import { on } from "@/lib/events";
import { toast } from "sonner";
import type { NoteItem } from "@/lib/types";

interface DateGroup {
  date: string;
  notes: NoteItem[];
}

const POLL_INTERVAL = 5000;

export function useNotes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadDone = useRef(false);

  const fetchNotes = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const deviceId = await getDeviceId();

      const { data: records, error: err } = await supabase
        .from("record")
        .select(`
          id,
          status,
          duration_seconds,
          location_text,
          created_at,
          archived,
          summary (title, short_summary),
          record_tag (tag:tag_id (name))
        `)
        .eq("device_id", deviceId)
        .eq("archived", false)
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
      initialLoadDone.current = true;
    } catch (e: any) {
      setError(e.message ?? "Failed to load notes");
    } finally {
      if (!initialLoadDone.current) setLoading(false);
      else setLoading(false);
    }
  }, []);

  // Start/stop polling based on whether any notes are still processing
  useEffect(() => {
    const hasProcessing = notes.some(
      (n) =>
        n.status === "uploading" ||
        n.status === "uploaded" ||
        n.status === "processing",
    );

    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(() => fetchNotes(true), POLL_INTERVAL);
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [notes, fetchNotes]);

  // Initial fetch + event listeners
  useEffect(() => {
    fetchNotes();

    const unsubUploaded = on("recording:uploaded", () => fetchNotes(true));
    const unsubProcessed = on("recording:processed", () => fetchNotes(true));

    return () => {
      unsubUploaded();
      unsubProcessed();
    };
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

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      try {
        const deviceId = await getDeviceId();

        // Get audio paths for storage cleanup
        const { data: records } = await supabase
          .from("record")
          .select("id, audio_path")
          .in("id", ids)
          .eq("device_id", deviceId);

        const audioPaths = (records ?? [])
          .map((r: any) => r.audio_path)
          .filter(Boolean);

        // Delete from storage
        if (audioPaths.length > 0) {
          await supabase.storage
            .from("audio-recordings")
            .remove(audioPaths);
        }

        // Delete records (cascade will handle transcript, summary, tags, todos, ideas)
        const { error } = await supabase
          .from("record")
          .delete()
          .in("id", ids)
          .eq("device_id", deviceId);

        if (error) throw error;

        setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
        toast(`已删除 ${ids.length} 条笔记`);
      } catch (e: any) {
        toast.error(`删除失败: ${e.message}`);
      }
    },
    [],
  );

  const archiveNotes = useCallback(
    async (ids: string[]) => {
      try {
        const deviceId = await getDeviceId();

        const { error } = await supabase
          .from("record")
          .update({ archived: true })
          .in("id", ids)
          .eq("device_id", deviceId);

        if (error) throw error;

        setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
        toast(`已归档 ${ids.length} 条笔记`);
      } catch (e: any) {
        toast.error(`归档失败: ${e.message}`);
      }
    },
    [],
  );

  return { notes, loading, error, refetch: fetchNotes, groupByDate, deleteNotes, archiveNotes };
}
