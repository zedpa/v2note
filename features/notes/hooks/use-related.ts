"use client";

import { useState, useCallback } from "react";
import {
  fetchRelatedRecords,
  type RelatedRecord,
} from "@/shared/lib/api/cognitive";

export function useRelated(recordId: string) {
  const [related, setRelated] = useState<RelatedRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRelatedRecords(recordId);
      setRelated(data.related);
      setCount(data.count);
      setLoaded(true);
    } catch {
      // 静默失败，关联是增强功能
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  return { related, count, loading, loaded, fetch };
}
