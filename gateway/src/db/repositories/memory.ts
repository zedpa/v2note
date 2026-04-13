import { query, queryOne, execute } from "../pool.js";

export interface MemoryEntry {
  id: string;
  device_id: string;
  user_id: string | null;
  content: string;
  source_date: string | null;
  importance: number;
  created_at: string;
}

/** @deprecated 使用 findByUser 替代。deviceId 身份体系已废弃。 */
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
  user_id?: string;
  content: string;
  source_date?: string;
  importance?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO memory (device_id, user_id, content, source_date, importance)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      fields.device_id,
      fields.user_id ?? null,
      fields.content,
      fields.source_date ?? null,
      fields.importance ?? 5,
    ],
  );
}

export async function findByUser(
  userId: string,
  dateRange?: { start: string; end: string },
  limit?: number,
): Promise<MemoryEntry[]> {
  if (dateRange) {
    return query<MemoryEntry>(
      `SELECT * FROM memory WHERE user_id = $1
       AND source_date >= $2 AND source_date <= $3
       ORDER BY importance DESC LIMIT $4`,
      [userId, dateRange.start, dateRange.end, limit ?? 50],
    );
  }
  return query<MemoryEntry>(
    `SELECT * FROM memory WHERE user_id = $1
     ORDER BY importance DESC LIMIT $2`,
    [userId, limit ?? 50],
  );
}

export async function findById(id: string): Promise<MemoryEntry | null> {
  return queryOne<MemoryEntry>(
    `SELECT * FROM memory WHERE id = $1`,
    [id],
  );
}

export async function deleteById(id: string, deviceId: string): Promise<void> {
  await execute(
    `DELETE FROM memory WHERE id = $1 AND device_id = $2`,
    [id, deviceId],
  );
}

export async function deleteByIdAndUser(id: string, userId: string): Promise<void> {
  await execute(
    `DELETE FROM memory WHERE id = $1 AND user_id = $2`,
    [id, userId],
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

/** 统计用户记忆总条数 */
export async function countByUser(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory WHERE user_id = $1`,
    [userId],
  );
  return parseInt(row?.count ?? "0", 10);
}

/** 删除用户最低重要性的 N 条记忆（为新记忆腾位置） */
export async function evictLeastImportant(userId: string, count: number): Promise<number> {
  const result = await execute(
    `DELETE FROM memory WHERE id IN (
       SELECT id FROM memory WHERE user_id = $1
       ORDER BY importance ASC, created_at ASC LIMIT $2
     )`,
    [userId, count],
  );
  return result;
}

export async function updateByUser(
  id: string,
  userId: string,
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
  params.push(id, userId);
  await execute(
    `UPDATE memory SET ${sets.join(", ")} WHERE id = $${i++} AND user_id = $${i}`,
    params,
  );
}
