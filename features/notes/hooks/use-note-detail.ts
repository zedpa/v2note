"use client";

import { useState, useEffect, useCallback } from "react";
import type { NoteDetail } from "@/shared/lib/types";
import { getRecord } from "@/shared/lib/api/records";
import { getDeviceId } from "@/shared/lib/device";

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
      await getDeviceId(); // ensure API deviceId is set
      const data = await getRecord(recordId);

      setDetail({
        record: data,
        transcript: data.transcript ?? null,
        summary: data.summary ?? null,
        tags: data.tags ?? [],
        todos: data.todos ?? [],
        ideas: data.ideas ?? [],
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
