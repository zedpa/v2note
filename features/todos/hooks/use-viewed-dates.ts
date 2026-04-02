"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "v2note:viewed-dates";
const MAX_AGE_DAYS = 60;

/** 从 localStorage 读取已查看日期，自动清理 60 天前的记录 */
function loadViewedDates(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr: string[] = JSON.parse(raw);

    // 清理超过 60 天的
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return new Set(arr.filter((d) => d >= cutoffStr));
  } catch {
    return new Set();
  }
}

function saveViewedDates(dates: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dates]));
  } catch {
    // localStorage 可能不可用
  }
}

/**
 * 管理已查看日期的 hook
 * - 持久化到 localStorage
 * - 超过 60 天自动清理
 */
export function useViewedDates() {
  const [viewedDates, setViewedDates] = useState<Set<string>>(() => new Set());

  // 客户端挂载后从 localStorage 加载
  useEffect(() => {
    setViewedDates(loadViewedDates());
  }, []);

  const markViewed = useCallback((dateStr: string) => {
    setViewedDates((prev) => {
      if (prev.has(dateStr)) return prev;
      const next = new Set(prev);
      next.add(dateStr);
      saveViewedDates(next);
      return next;
    });
  }, []);

  return { viewedDates, markViewed };
}
