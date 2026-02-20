import { query, queryOne, execute } from "../pool.js";

export interface Record {
  id: string;
  device_id: string;
  status: string;
  source: string;
  audio_path: string | null;
  duration_seconds: number | null;
  location_text: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export async function findByDevice(
  deviceId: string,
  opts?: { archived?: boolean; limit?: number; offset?: number },
): Promise<Record[]> {
  const conditions = [`device_id = $1`];
  const params: any[] = [deviceId];
  let i = 2;
  if (opts?.archived !== undefined) {
    conditions.push(`archived = $${i++}`);
    params.push(opts.archived);
  }
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return query<Record>(
    `SELECT * FROM record WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    [...params, limit, offset],
  );
}

export async function findById(id: string): Promise<Record | null> {
  return queryOne<Record>(`SELECT * FROM record WHERE id = $1`, [id]);
}

export async function create(fields: {
  device_id: string;
  status?: string;
  source?: string;
  audio_path?: string;
  duration_seconds?: number;
  location_text?: string;
}): Promise<Record> {
  const row = await queryOne<Record>(
    `INSERT INTO record (device_id, status, source, audio_path, duration_seconds, location_text)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      fields.device_id,
      fields.status ?? "uploading",
      fields.source ?? "voice",
      fields.audio_path ?? null,
      fields.duration_seconds ?? null,
      fields.location_text ?? null,
    ],
  );
  return row!;
}

export async function updateStatus(id: string, status: string): Promise<void> {
  await execute(
    `UPDATE record SET status = $1, updated_at = now() WHERE id = $2`,
    [status, id],
  );
}

export async function updateFields(
  id: string,
  fields: { status?: string; archived?: boolean; duration_seconds?: number },
): Promise<void> {
  const sets: string[] = ["updated_at = now()"];
  const params: any[] = [];
  let i = 1;
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(fields.status);
  }
  if (fields.archived !== undefined) {
    sets.push(`archived = $${i++}`);
    params.push(fields.archived);
  }
  if (fields.duration_seconds !== undefined) {
    sets.push(`duration_seconds = $${i++}`);
    params.push(fields.duration_seconds);
  }
  params.push(id);
  await execute(`UPDATE record SET ${sets.join(", ")} WHERE id = $${i}`, params);
}

export async function deleteByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  return execute(`DELETE FROM record WHERE id IN (${placeholders})`, ids);
}

export async function archive(id: string): Promise<void> {
  await execute(
    `UPDATE record SET archived = true, updated_at = now() WHERE id = $1`,
    [id],
  );
}

export async function search(
  deviceId: string,
  q: string,
): Promise<Record[]> {
  return query<Record>(
    `SELECT DISTINCT r.* FROM record r
     LEFT JOIN transcript t ON t.record_id = r.id
     LEFT JOIN summary s ON s.record_id = r.id
     WHERE r.device_id = $1
       AND (t.text ILIKE $2 OR s.title ILIKE $2 OR s.short_summary ILIKE $2)
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [deviceId, `%${q}%`],
  );
}

export async function countByDateRange(
  deviceId: string,
  start: string,
  end: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM record
     WHERE device_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [deviceId, start, end],
  );
  return parseInt(row?.count ?? "0", 10);
}

export async function findByDeviceAndDateRange(
  deviceId: string,
  start: string,
  end: string,
): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE device_id = $1
     AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`,
    [deviceId, start, end],
  );
}
