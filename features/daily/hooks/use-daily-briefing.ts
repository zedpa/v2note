"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/shared/lib/api";
import { getLocalToday } from "@/features/todos/lib/date-utils";

interface BriefingResult {
  greeting: string;
  today_focus: string[];
  carry_over: string[];
  goal_pulse: Array<{ title: string; progress: string }>;
  stats: { yesterday_done: number; yesterday_total: number };
}

interface SummaryResult {
  headline: string;
  accomplishments: string[];
  insight: string;
  affirmation: string;
  tomorrow_preview: string[];
  stats: { done: number; new_records: number };
}

// ── localStorage 缓存工具 ──

interface CachedReport<T> {
  date: string;
  data: T;
}

function loadCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: CachedReport<T> = JSON.parse(raw);
    const today = getLocalToday();
    if (cached.date === today) return cached.data;
    return null;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T): void {
  try {
    const today = getLocalToday();
    localStorage.setItem(key, JSON.stringify({ date: today, data }));
  } catch { /* ignore */ }
}

const BRIEFING_CACHE_KEY = "v2note:daily:briefing";
const SUMMARY_CACHE_KEY = "v2note:daily:summary";

// ── Hooks ──

export function useDailyBriefing() {
  const [briefing, setBriefing] = useState<BriefingResult | null>(
    () => loadCached<BriefingResult>(BRIEFING_CACHE_KEY),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=true" : "";
      const data = await api.get<BriefingResult>(`/api/v1/daily/briefing${qs}`);
      setBriefing(data);
      saveCache(BRIEFING_CACHE_KEY, data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  return { briefing, loading, error, refresh: fetchBriefing };
}

export function useEveningSummary() {
  const [summary, setSummary] = useState<SummaryResult | null>(
    () => loadCached<SummaryResult>(SUMMARY_CACHE_KEY),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=true" : "";
      const data = await api.get<SummaryResult>(`/api/v1/daily/evening-summary${qs}`);
      setSummary(data);
      saveCache(SUMMARY_CACHE_KEY, data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refresh: fetchSummary };
}
