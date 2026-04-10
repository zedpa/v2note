"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchTopicLifecycle,
  type TopicLifecycle,
} from "@/shared/lib/api/topics";

interface UseTopicLifecycleResult {
  lifecycle: TopicLifecycle | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * 获取主题生命周期数据（四阶段：此刻/正在长/种子/已收获）
 * 当 wikiPageId 非空时自动拉取，相同 wikiPageId 使用缓存
 */
export function useTopicLifecycle(
  wikiPageId: string | null,
): UseTopicLifecycleResult {
  const [lifecycle, setLifecycle] = useState<TopicLifecycle | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, TopicLifecycle>>(new Map());
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    // 清除当前 wikiPageId 的缓存，触发重新拉取
    if (wikiPageId) {
      cacheRef.current.delete(wikiPageId);
    }
    setFetchKey((k) => k + 1);
  }, [wikiPageId]);

  useEffect(() => {
    if (!wikiPageId) {
      setLifecycle(null);
      setLoading(false);
      return;
    }

    // 命中缓存则直接使用
    const cached = cacheRef.current.get(wikiPageId);
    if (cached && fetchKey === 0) {
      setLifecycle(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchTopicLifecycle(wikiPageId)
      .then((data) => {
        if (cancelled) return;
        cacheRef.current.set(wikiPageId, data);
        setLifecycle(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLifecycle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wikiPageId, fetchKey]);

  return { lifecycle, loading, refetch };
}
