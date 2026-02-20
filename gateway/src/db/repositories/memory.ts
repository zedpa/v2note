import { query, queryOne, execute } from "../pool.js";

export interface MemoryEntry {
  id: string;
  device_id: string;
  content: string;
  source_date: string | null;
  importance: number;
  created_at: string;
}

export async function findByDevice(
  deviceId: string,
  dateRange?: { start: string; end: string },
  limit?: number,
): Promise<MemoryEntry[]> {
  if (dateRange) {
    return query<MemoryEntry>(
      `SELECT * FROM memory WHERE device_id = $1
       AND source_date >= $2 AND source_date <= $3
       ORDER BY importance DESC LIMIT $4`,
      [deviceId, dateRange.start, dateRange.end, limit ?? 50],
    );
  }
  return query<MemoryEntry>(
    `SELECT * FROM memory WHERE device_id = $1
     ORDER BY importance DESC LIMIT $2`,
    [deviceId, limit ?? 50],
  );
}

export async function create(fields: {
  device_id: string;
  content: string;
  source_date?: string;
  importance?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO memory (device_id, content, source_date, importance)
     VALUES ($1, $2, $3, $4)`,
    [
      fields.device_id,
      fields.content,
      fields.source_date ?? null,
      fields.importance ?? 5,
    ],
  );
}

export async function deleteById(id: string, deviceId: string): Promise<void> {
  await execute(
    `DELETE FROM memory WHERE id = $1 AND device_id = $2`,
    [id, deviceId],
  );
}

export async function update(
  id: string,
  deviceId: string,
  fields: { content?: string; importance?: number },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.content !== undefined) {
    sets.push(`content = $${i++}`);
    params.push(fields.content);
  }
  if (fields.importance !== undefined) {
    sets.push(`importance = $${i++}`);
    params.push(fields.importance);
  }
  if (sets.length === 0) return;
  params.push(id, deviceId);
  await execute(
    `UPDATE memory SET ${sets.join(", ")} WHERE id = $${i++} AND device_id = $${i}`,
    params,
  );
}
