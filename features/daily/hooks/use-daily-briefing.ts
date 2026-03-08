"use client";

import { useState, useEffect, useCallback } from "react";
import { getGatewayHttpUrl } from "@/shared/lib/gateway-url";
import { getDeviceId } from "@/shared/lib/device";

interface BriefingResult {
  greeting: string;
  priority_items: string[];
  unfinished: string[];
  relay_pending: Array<{
    person: string;
    context: string;
    todoId: string;
  }>;
  followups: string[];
  stats: { yesterday_done: number; yesterday_total: number; streak: number };
}

interface SummaryResult {
  accomplishments: string[];
  pending_items: string[];
  relay_summary: string[];
  stats: { done: number; new_records: number; relays_completed: number };
  tomorrow_seeds: string[];
}

export function useDailyBriefing() {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const baseUrl = getGatewayHttpUrl();
      const res = await fetch(`${baseUrl}/api/v1/daily/briefing`, {
        headers: { "X-Device-Id": deviceId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const baseUrl = getGatewayHttpUrl();
      const res = await fetch(`${baseUrl}/api/v1/daily/evening-summary`, {
        headers: { "X-Device-Id": deviceId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
  const deviceId = await getDeviceId();
  const baseUrl = getGatewayHttpUrl();
  await fetch(`${baseUrl}/api/v1/daily/relays/${todoId}`, {
    method: "PATCH",
    headers: {
      "X-Device-Id": deviceId,
      "Content-Type": "application/json",
    },
  });
}
