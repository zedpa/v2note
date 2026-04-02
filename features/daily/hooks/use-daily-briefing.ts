"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/shared/lib/api";

interface BriefingResult {
  greeting: string;
  today_focus: string[];
  goal_progress: Array<{
    title: string;
    pending_count: number;
    today_todos: string[];
  }>;
  carry_over: string[];
  relay_pending: Array<{
    person: string;
    context: string;
    todoId: string;
  }>;
  ai_suggestions: string[];
  stats: { yesterday_done: number; yesterday_total: number; streak: number };
}

interface SummaryResult {
  accomplishments: string[];
  cognitive_highlights: string[];
  goal_updates: Array<{
    title: string;
    completed_count: number;
    remaining_count: number;
    note: string;
  }>;
  attention_needed: string[];
  relay_summary: string[];
  stats: { done: number; new_records: number; new_strikes: number; relays_completed: number };
  tomorrow_preview: {
    scheduled: string[];
    carry_over: string[];
    follow_up: string[];
  };
}

export function useDailyBriefing() {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=true" : "";
      const data = await api.get<BriefingResult>(`/api/v1/daily/briefing${qs}`);
      setBriefing(data);
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
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=true" : "";
      const data = await api.get<SummaryResult>(`/api/v1/daily/evening-summary${qs}`);
      setSummary(data);
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

export async function markRelayDone(todoId: string): Promise<void> {
  await api.patch(`/api/v1/daily/relays/${todoId}`);
}
