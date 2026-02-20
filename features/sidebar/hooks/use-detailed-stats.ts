"use client";

import { useState, useEffect } from "react";
import { getDeviceId } from "@/shared/lib/device";
import {
  getWeekStats,
  getDailyTrend,
  getTagDistribution,
  getTodoTrend,
} from "@/shared/lib/api/stats";

export interface DetailedStats {
  totalRecords: number;
  totalTodos: number;
  completedTodos: number;
  completionRate: number;
  dailyTrend: Array<{ date: string; count: number }>;
  tagDistribution: Array<{ name: string; count: number }>;
  todoTrend: Array<{ date: string; created: number; completed: number }>;
  streak: number;
  loading: boolean;
}

function calcStreak(dailyTrend: Array<{ date: string; count: number }>): number {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = dailyTrend.length - 1; i >= 0; i--) {
    const d = new Date(dailyTrend[i].date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff === streak && dailyTrend[i].count > 0) {
      streak++;
    } else if (diff > streak) {
      break;
    }
  }
  return streak;
}

export function useDetailedStats(): DetailedStats {
  const [stats, setStats] = useState<DetailedStats>({
    totalRecords: 0,
    totalTodos: 0,
    completedTodos: 0,
    completionRate: 0,
    dailyTrend: [],
    tagDistribution: [],
    todoTrend: [],
    streak: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await getDeviceId();
        const [week, daily, tags, todos] = await Promise.all([
          getWeekStats(),
          getDailyTrend(),
          getTagDistribution(),
          getTodoTrend(),
        ]);

        if (cancelled) return;

        const rate = week.todoTotal > 0
          ? Math.round((week.todoDone / week.todoTotal) * 100)
          : 0;

        setStats({
          totalRecords: week.recordCount,
          totalTodos: week.todoTotal,
          completedTodos: week.todoDone,
          completionRate: rate,
          dailyTrend: daily,
          tagDistribution: tags,
          todoTrend: todos,
          streak: calcStreak(daily),
          loading: false,
        });
      } catch {
        if (!cancelled) setStats((s) => ({ ...s, loading: false }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return stats;
}
