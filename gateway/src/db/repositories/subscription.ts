import { queryOne } from "../pool.js";

export async function getUsageStats(
  deviceId: string,
): Promise<{ monthly_count: number; limit: number }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM record
     WHERE device_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [deviceId, monthStart, monthEnd],
  );

  return {
    monthly_count: parseInt(row?.count ?? "0", 10),
    limit: 500, // default limit
  };
}
