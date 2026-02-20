"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { IdeaItem } from "@/shared/lib/types";
import { listIdeas } from "@/shared/lib/api/ideas";

export function useIdeas() {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      setLoading(true);
      await getDeviceId(); // ensure API deviceId is set

      const data = await listIdeas();

      const items: IdeaItem[] = data.map((t: any) => ({
        id: t.id,
        text: t.text,
        source: null,
        record_id: t.record_id,
        created_at: t.created_at,
      }));

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
