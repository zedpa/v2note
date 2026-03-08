import { query, queryOne, execute } from "../pool.js";

export interface DailyBriefing {
  id: string;
  device_id: string;
  briefing_date: string;
  briefing_type: string;
  content: any;
  generated_at: string;
}

export async function findByDeviceAndDate(
  deviceId: string,
  date: string,
  type: "morning" | "evening" = "morning",
): Promise<DailyBriefing | null> {
  return queryOne<DailyBriefing>(
    `SELECT * FROM daily_briefing
     WHERE device_id = $1 AND briefing_date = $2 AND briefing_type = $3`,
    [deviceId, date, type],
  );
}

/**
 * Upsert a briefing. If a cached one exists within TTL, skip.
 * Returns the cached or newly created briefing.
 */
export async function upsert(
  deviceId: string,
  date: string,
  type: "morning" | "evening",
  content: any,
): Promise<DailyBriefing> {
  const row = await queryOne<DailyBriefing>(
    `INSERT INTO daily_briefing (device_id, briefing_date, briefing_type, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, briefing_date, briefing_type)
     DO UPDATE SET content = $4, generated_at = now()
     RETURNING *`,
    [deviceId, date, type, JSON.stringify(content)],
  );
  return row!;
}

/**
 * Check if a cached briefing exists and is fresh (within TTL hours).
 */
export async function findFresh(
  deviceId: string,
  date: string,
  type: "morning" | "evening",
  ttlHours: number = 2,
): Promise<DailyBriefing | null> {
  return queryOne<DailyBriefing>(
    `SELECT * FROM daily_briefing
     WHERE device_id = $1 AND briefing_date = $2 AND briefing_type = $3
     AND generated_at > now() - interval '1 hour' * $4`,
    [deviceId, date, type, ttlHours],
  );
}
