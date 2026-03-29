"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchTopics, type TopicItem } from "@/shared/lib/api/topics";

interface UseTopicsResult {
  topics: TopicItem[];
  /** 有活跃目标的主题 */
  active: TopicItem[];
  /** 无聚类关联的独立目标 */
  independent: TopicItem[];
  /** 无活跃目标但成员数 >= 3 的静默主题 */
  silent: TopicItem[];
  loading: boolean;
}

/**
 * 侧边栏主题列表 hook
 * 拉取所有主题并按状态分组：active / independent / silent
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
      } else if (topic.memberCount < 3) {
        // 独立目标：没有活跃目标且成员数不足以形成聚类
        independentTopics.push(topic);
      } else {
        // 静默主题：无活跃目标但成员数 >= 3
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
