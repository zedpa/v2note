import { supabase } from "./supabase";
import { getDeviceId } from "./device";

export interface UsageLimits {
  recordings_per_month: number;
  ai_summaries_per_month: number;
  storage_mb: number;
}

export const FREE_LIMITS: UsageLimits = {
  recordings_per_month: 30,
  ai_summaries_per_month: 10,
  storage_mb: 500,
};

export interface UsageStats {
  recordings_this_month: number;
  ai_summaries_this_month: number;
  storage_used_mb: number;
}

export async function getUsageStats(): Promise<UsageStats> {
  const deviceId = await getDeviceId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Count recordings this month
  const { count: recordCount } = await supabase
    .from("record")
    .select("*", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", monthStart);

  // Count completed (AI processed) records this month
  const { count: summaryCount } = await supabase
    .from("record")
    .select("*", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .eq("status", "completed")
    .gte("created_at", monthStart);

  return {
    recordings_this_month: recordCount ?? 0,
    ai_summaries_this_month: summaryCount ?? 0,
    storage_used_mb: 0, // TODO: calculate from storage bucket
  };
}

export function isLimitReached(stats: UsageStats, limits: UsageLimits): {
  recordings: boolean;
  summaries: boolean;
  storage: boolean;
  any: boolean;
} {
  const recordings = stats.recordings_this_month >= limits.recordings_per_month;
  const summaries = stats.ai_summaries_this_month >= limits.ai_summaries_per_month;
  const storage = stats.storage_used_mb >= limits.storage_mb;
  return { recordings, summaries, storage, any: recordings || summaries || storage };
}
