"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchTopics, type TopicItem } from "@/shared/lib/api/topics";

interface UseTopicsResult {
  topics: TopicItem[];
  /** 有活跃目标的主题 */
  active: TopicItem[];
  /** 无聚类关联的独立目标（recordCount < 3 且无活跃目标） */
  independent: TopicItem[];
  /** 无活跃目标但 recordCount >= 3 的沉默主题 */
  silent: TopicItem[];
  loading: boolean;
}

/**
 * 侧边栏主题列表 hook
 * 拉取所有 wiki-page-based 主题并按状态分组：active / independent / silent
 */
export function useTopics(): UseTopicsResult {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchTopics()
      .then((data) => {
        if (!cancelled) setTopics(data || []);
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { active, independent, silent } = useMemo(() => {
    const activeTopics: TopicItem[] = [];
    const independentTopics: TopicItem[] = [];
    const silentTopics: TopicItem[] = [];

    for (const topic of topics) {
      if (topic.hasActiveGoal) {
        activeTopics.push(topic);
      } else if (topic.recordCount < 3) {
        // 独立目标：没有活跃目标且关联 record 数不足
        independentTopics.push(topic);
      } else {
        // 沉默主题：无活跃目标但有足够内容
        silentTopics.push(topic);
      }
    }

    return {
      active: activeTopics,
      independent: independentTopics,
      silent: silentTopics,
    };
  }, [topics]);

  return { topics, active, independent, silent, loading };
}
