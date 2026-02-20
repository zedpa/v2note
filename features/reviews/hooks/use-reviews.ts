"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { Review } from "@/shared/lib/types";
import { listReviews, generateReview as apiGenerateReview } from "@/shared/lib/api/reviews";

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      await getDeviceId(); // ensure API deviceId is set
      const data = await listReviews();
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
        await getDeviceId(); // ensure API deviceId is set

        const review = await apiGenerateReview({
          period,
          start: periodStart,
          end: periodEnd,
        });

        // Refresh reviews after generation
        await fetchReviews();
        return review;
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
