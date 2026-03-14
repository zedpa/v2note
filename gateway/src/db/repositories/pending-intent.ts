import { query, queryOne, execute } from "../pool.js";

export interface PendingIntent {
  id: string;
  device_id: string;
  record_id: string | null;
  intent_type: "wish" | "goal" | "complaint" | "reflection";
  text: string;
  context: string | null;
  status: "pending" | "confirmed" | "dismissed" | "promoted";
  promoted_to: string | null;
  created_at: string;
}

export async function findPendingByDevice(deviceId: string): Promise<PendingIntent[]> {
  return query<PendingIntent>(
    `SELECT * FROM pending_intent WHERE device_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [deviceId],
  );
}

export async function findPendingByUser(userId: string): Promise<PendingIntent[]> {
  return query<PendingIntent>(
    `SELECT * FROM pending_intent WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [userId],
  );
}

export async function findById(id: string): Promise<PendingIntent | null> {
  return queryOne<PendingIntent>(`SELECT * FROM pending_intent WHERE id = $1`, [id]);
}

export async function create(fields: {
  device_id: string;
  record_id?: string;
  intent_type: string;
  text: string;
  context?: string;
}): Promise<PendingIntent> {
  const row = await queryOne<PendingIntent>(
    `INSERT INTO pending_intent (device_id, record_id, intent_type, text, context) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [fields.device_id, fields.record_id ?? null, fields.intent_type, fields.text, fields.context ?? null],
  );
  return row!;
}

export async function updateStatus(
  id: string,
  status: string,
  promotedTo?: string,
): Promise<void> {
  await execute(
    `UPDATE pending_intent SET status = $1, promoted_to = $2 WHERE id = $3`,
    [status, promotedTo ?? null, id],
  );
}
