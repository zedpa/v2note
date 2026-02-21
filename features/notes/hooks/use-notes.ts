"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceId } from "@/shared/lib/device";
import { on } from "@/features/recording/lib/events";
import { toast } from "sonner";
import type { NoteItem } from "@/shared/lib/types";
import { getCachedNotes, setCachedNotes } from "@/features/workspace/lib/cache";
import { listRecords, deleteRecords as apiDeleteRecords, updateRecord } from "@/shared/lib/api/records";

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

  // Load from cache on first render
  const cacheLoadedRef = useRef(false);
  useEffect(() => {
    if (cacheLoadedRef.current) return;
    cacheLoadedRef.current = true;
    getCachedNotes().then((cached) => {
      if (cached && cached.length > 0 && notes.length === 0) {
        setNotes(cached);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotes = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      await getDeviceId(); // ensure deviceId is set in api client

      const records = await listRecords();

      const items: NoteItem[] = records.map((r: any) => {
        const summary = r.summary;
        const transcript = r.transcript?.text ?? "";
        const tags = (r.tags ?? []).map((t: any) => t.name).filter(Boolean);

        const dt = new Date(r.created_at);
        const date = `${dt.getMonth() + 1}月${dt.getDate()}日`;
        const time = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

        // Fallback: use transcript when summary is not available yet
        const title = summary?.title || transcript.slice(0, 50) || "处理中...";
        const short_summary = summary?.short_summary || transcript.slice(0, 200) || "";

        // Only show audio_path when it's a valid URL
        const audioPath = r.audio_path && r.audio_path.startsWith("http") ? r.audio_path : null;

        return {
          id: r.id,
          title,
          short_summary,
          tags,
          date,
          time,
          location: r.location_text,
          status: r.status,
          duration_seconds: r.duration_seconds,
          audio_path: audioPath,
          created_at: r.created_at,
        };
      });

      setNotes(items);
      setError(null);
      initialLoadDone.current = true;

      // Update local cache
      setCachedNotes(items);
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
        await apiDeleteRecords(ids);
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
        for (const id of ids) {
          await updateRecord(id, { archived: true });
        }
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
