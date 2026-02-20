import { getDeviceId } from "./device";
import { getUsageStats as apiGetUsageStats } from "./api/stats";

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
  await getDeviceId(); // ensure API deviceId is set

  const stats = await apiGetUsageStats();

  return {
    recordings_this_month: stats.monthlyCount,
    ai_summaries_this_month: stats.monthlyCount, // approximation; both use same count
    storage_used_mb: 0,
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
