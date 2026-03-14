import { query, queryOne } from "../pool.js";

export interface Review {
  id: string;
  device_id: string;
  period: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  stats: any;
  structured_data: any;
  created_at: string;
}

export async function findByDevice(
  deviceId: string,
  period?: string,
): Promise<Review[]> {
  if (period) {
    return query<Review>(
      `SELECT * FROM review WHERE device_id = $1 AND period = $2
       ORDER BY period_start DESC`,
      [deviceId, period],
    );
  }
  return query<Review>(
    `SELECT * FROM review WHERE device_id = $1 ORDER BY period_start DESC`,
    [deviceId],
  );
}

export async function findByUser(
  userId: string,
  period?: string,
): Promise<Review[]> {
  if (period) {
    return query<Review>(
      `SELECT * FROM review WHERE user_id = $1 AND period = $2
       ORDER BY period_start DESC`,
      [userId, period],
    );
  }
  return query<Review>(
    `SELECT * FROM review WHERE user_id = $1 ORDER BY period_start DESC`,
    [userId],
  );
}

export async function create(fields: {
  device_id: string;
  user_id?: string;
  period: string;
  period_start: string;
  period_end: string;
  summary?: string;
  stats?: any;
  structured_data?: any;
}): Promise<Review> {
  const row = await queryOne<Review>(
    `INSERT INTO review (device_id, user_id, period, period_start, period_end, summary, stats, structured_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (device_id, period, period_start)
     DO UPDATE SET summary = EXCLUDED.summary, stats = EXCLUDED.stats,
                   structured_data = EXCLUDED.structured_data,
                   user_id = COALESCE(EXCLUDED.user_id, review.user_id)
     RETURNING *`,
    [
      fields.device_id,
      fields.user_id ?? null,
      fields.period,
      fields.period_start,
      fields.period_end,
      fields.summary ?? null,
      fields.stats ? JSON.stringify(fields.stats) : null,
      fields.structured_data ? JSON.stringify(fields.structured_data) : null,
    ],
  );
  return row!;
}
