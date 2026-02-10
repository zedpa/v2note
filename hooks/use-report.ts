"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

interface ReportResult {
  period: ReportPeriod;
  label: string;
  record_count: number;
  summary: string | null;
  message?: string;
}

export function useReport() {
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (period: ReportPeriod, date?: string) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const deviceId = await getDeviceId();

      const { data, error: err } = await supabase.functions.invoke("generate_summary", {
        body: {
          device_id: deviceId,
          period,
          date,
        },
      });

      if (err) throw err;
      setResult(data as ReportResult);
    } catch (e: any) {
      setError(e.message ?? "生成报告失败");
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, generate };
}
