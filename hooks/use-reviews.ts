"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { Review } from "@/lib/types";

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const { data, error } = await supabase
        .from("review")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReviews(data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Build a map for easy lookup: "daily:2026-01-05" → Review
  const reviewMap = new Map<string, Review>();
  for (const r of reviews) {
    reviewMap.set(`${r.period}:${r.period_start}`, r);
  }

  const generateReview = useCallback(
    async (period: Review["period"], periodStart: string, periodEnd: string) => {
      try {
        setGenerating(true);
        const deviceId = await getDeviceId();

        const { data, error } = await supabase.functions.invoke("generate_review", {
          body: {
            device_id: deviceId,
            period,
            period_start: periodStart,
            period_end: periodEnd,
          },
        });

        if (error) throw error;

        // Refresh reviews after generation
        await fetchReviews();
        return data?.review;
      } catch (err: any) {
        throw new Error(err.message ?? "生成失败");
      } finally {
        setGenerating(false);
      }
    },
    [fetchReviews],
  );

  return { reviews, reviewMap, loading, generating, generateReview, refetch: fetchReviews };
}
