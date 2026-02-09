"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { NoteDetail } from "@/lib/types";

export function useNoteDetail(recordId: string | null) {
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!recordId) {
      setDetail(null);
      return;
    }

    try {
      setLoading(true);

      const [recordRes, transcriptRes, summaryRes, tagsRes, todosRes, ideasRes] =
        await Promise.all([
          supabase.from("record").select("*").eq("id", recordId).single(),
          supabase.from("transcript").select("*").eq("record_id", recordId).single(),
          supabase.from("summary").select("*").eq("record_id", recordId).single(),
          supabase
            .from("record_tag")
            .select("tag:tag_id (id, name)")
            .eq("record_id", recordId),
          supabase.from("todo").select("*").eq("record_id", recordId).order("created_at"),
          supabase.from("idea").select("*").eq("record_id", recordId).order("created_at"),
        ]);

      if (recordRes.error) throw recordRes.error;

      const tags = (tagsRes.data ?? []).map((rt: any) => rt.tag).filter(Boolean);

      setDetail({
        record: recordRes.data,
        transcript: transcriptRes.data ?? null,
        summary: summaryRes.data ?? null,
        tags,
        todos: todosRes.data ?? [],
        ideas: ideasRes.data ?? [],
      });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load detail");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { detail, loading, error, refetch: fetchDetail };
}
