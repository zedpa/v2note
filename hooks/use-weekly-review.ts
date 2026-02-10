"use client";

import { useState, useCallback } from "react";
import { useSummaries } from "./use-summaries";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import { toast } from "sonner";

export function useWeeklyReview() {
  const { reviews, loading, refetch } = useSummaries();
  const [generating, setGenerating] = useState(false);

  const generate = useCallback(async () => {
    try {
      setGenerating(true);
      const deviceId = await getDeviceId();

      const { error } = await supabase.functions.invoke("weekly_review", {
        body: { device_id: deviceId },
      });

      if (error) throw error;
      toast("周盘生成成功");
      await refetch();
    } catch (err: any) {
      toast.error(`周盘生成失败: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [refetch]);

  return { reviews, loading, generating, generate, refetch };
}
