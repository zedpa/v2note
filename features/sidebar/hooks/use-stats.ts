"use client";

import { useState, useEffect } from "react";
import { getDeviceId } from "@/shared/lib/device";
import { getWeekStats } from "@/shared/lib/api/stats";

export interface WeekStats {
  totalRecords: number;
  totalTodos: number;
  completedTodos: number;
  loading: boolean;
}

export function useStats(): WeekStats {
  const [stats, setStats] = useState<WeekStats>({
    totalRecords: 0,
    totalTodos: 0,
    completedTodos: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await getDeviceId(); // ensure API deviceId is set
        const data = await getWeekStats();

        if (cancelled) return;

        setStats({
          totalRecords: data.recordCount,
          totalTodos: data.todoTotal,
          completedTodos: data.todoDone,
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
