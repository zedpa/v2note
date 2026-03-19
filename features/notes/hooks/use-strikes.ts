"use client";

import { useState, useCallback } from "react";
import {
  fetchStrikesByRecord,
  updateStrike as apiUpdateStrike,
  type StrikeView,
} from "@/shared/lib/api/strikes";

export function useStrikes(recordId: string) {
  const [strikes, setStrikes] = useState<StrikeView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchStrikesByRecord(recordId);
      setStrikes(data);
      setLoaded(true);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load strikes");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  const updateStrike = useCallback(
    async (id: string, fields: { nucleus?: string; polarity?: string }) => {
      await apiUpdateStrike(id, fields);
      setStrikes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...fields } as StrikeView : s)),
      );
    },
    [],
  );

  return { strikes, loading, error, loaded, fetch, updateStrike };
}
