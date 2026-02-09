"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { WeeklyReview } from "@/lib/types";

export function useSummaries() {
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const deviceId = await getDeviceId();

      const { data, error } = await supabase
        .from("weekly_review")
        .select("*")
        .eq("device_id", deviceId)
        .order("week_start", { ascending: false })
        .limit(20);

      if (error) throw error;
      setReviews(data ?? []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, refetch: fetchReviews };
}
