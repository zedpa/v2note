import { query, queryOne, execute } from "../pool.js";

export interface Record {
  id: string;
  device_id: string;
  user_id: string | null;
  status: string;
  source: string;
  audio_path: string | null;
  duration_seconds: number | null;
  location_text: string | null;
  notebook: string | null;
  source_type: string;
  archived: boolean;
  digested: boolean;
  digested_at: string | null;
  file_url: string | null;
  file_name: string | null;
  domain?: string | null;
  hierarchy_tags?: Array<{ label: string; level: number }>;
  metadata: { [key: string]: any } | null;
  compile_status: string;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

// v2: 过滤待办页/指令模式创建的隐藏 record（仅用于溯源，不在日记列表展示）
const HIDDEN_SOURCES_CLAUSE = `AND source NOT IN ('todo_voice', 'command_voice')`;

export async function findByDevice(
  deviceId: string,
  opts?: { archived?: boolean; limit?: number; offset?: number; notebook?: string | null },
): Promise<Record[]> {
  const conditions = [`device_id = $1`];
  const params: any[] = [deviceId];
  let i = 2;
  if (opts?.archived !== undefined) {
    conditions.push(`archived = $${i++}`);
    params.push(opts.archived);
  }
  if (opts?.notebook !== undefined) {
    if (opts.notebook === null) {
      conditions.push(`notebook IS NULL`);
    } else {
      conditions.push(`notebook = $${i++}`);
      params.push(opts.notebook);
    }
  }
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return query<Record>(
    `SELECT * FROM record WHERE ${conditions.join(" AND ")}
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    [...params, limit, offset],
  );
}

export async function findByUser(
  userId: string,
  opts?: { archived?: boolean; limit?: number; offset?: number; notebook?: string | null },
): Promise<Record[]> {
  const conditions = [`user_id = $1`];
  const params: any[] = [userId];
  let i = 2;
  if (opts?.archived !== undefined) {
    conditions.push(`archived = $${i++}`);
    params.push(opts.archived);
  }
  if (opts?.notebook !== undefined) {
    if (opts.notebook === null) {
      conditions.push(`notebook IS NULL`);
    } else {
      conditions.push(`notebook = $${i++}`);
      params.push(opts.notebook);
    }
  }
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return query<Record>(
    `SELECT * FROM record WHERE ${conditions.join(" AND ")}
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    [...params, limit, offset],
  );
}

export async function findByUserAndDateRange(
  userId: string,
  start: string,
  end: string,
): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE user_id = $1
     AND created_at >= $2 AND created_at <= $3
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at ASC`,
    [userId, start, end],
  );
}

export async function findById(id: string): Promise<Record | null> {
  return queryOne<Record>(`SELECT * FROM record WHERE id = $1`, [id]);
}

export async function create(fields: {
  device_id?: string;
  user_id?: string;
  status?: string;
  source?: string;
  source_type?: string;
  audio_path?: string;
  duration_seconds?: number;
  location_text?: string;
  notebook?: string;
  file_url?: string;
  file_name?: string;
}): Promise<Record> {
  const row = await queryOne<Record>(
    `INSERT INTO record (device_id, user_id, status, source, source_type, audio_path, duration_seconds, location_text, notebook, file_url, file_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      fields.device_id ?? null,
      fields.user_id ?? null,
      fields.status ?? "uploading",
      fields.source ?? "voice",
      fields.source_type ?? "think",
      fields.audio_path ?? null,
      fields.duration_seconds ?? null,
      fields.location_text ?? null,
      fields.notebook ?? null,
      fields.file_url ?? null,
      fields.file_name ?? null,
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
  fields: { status?: string; archived?: boolean; duration_seconds?: number; source_type?: string; audio_path?: string; file_url?: string; file_name?: string },
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
  if (fields.source_type !== undefined) {
    sets.push(`source_type = $${i++}`);
    params.push(fields.source_type);
  }
  if (fields.audio_path !== undefined) {
    sets.push(`audio_path = $${i++}`);
    params.push(fields.audio_path);
  }
  if (fields.file_url !== undefined) {
    sets.push(`file_url = $${i++}`);
    params.push(fields.file_url);
  }
  if (fields.file_name !== undefined) {
    sets.push(`file_name = $${i++}`);
    params.push(fields.file_name);
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
       AND r.source NOT IN ('todo_voice', 'command_voice')
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [deviceId, `%${q}%`],
  );
}

export async function searchByUser(
  userId: string,
  q: string,
): Promise<Record[]> {
  return query<Record>(
    `SELECT DISTINCT r.* FROM record r
     LEFT JOIN transcript t ON t.record_id = r.id
     LEFT JOIN summary s ON s.record_id = r.id
     WHERE r.user_id = $1
       AND (t.text ILIKE $2 OR s.title ILIKE $2 OR s.short_summary ILIKE $2)
       AND r.source NOT IN ('todo_voice', 'command_voice')
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [userId, `%${q}%`],
  );
}

export async function countByUser(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM record WHERE user_id = $1`,
    [userId],
  );
  return parseInt(row?.count ?? "0", 10);
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

export async function countByUserDateRange(
  userId: string,
  start: string,
  end: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM record
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [userId, start, end],
  );
  return parseInt(row?.count ?? "0", 10);
}

export async function findUndigested(userId: string): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE user_id = $1 AND digested = FALSE AND status = 'completed'
       AND COALESCE(digest_attempts, 0) < 3
     ORDER BY created_at ASC`,
    [userId],
  );
}

/** 统计正在消化中的 record 数量（digested=false, status=completed, 未超过重试上限） */
export async function countUndigested(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM record WHERE user_id = $1
     AND digested = FALSE AND status = 'completed' AND archived = false
     AND COALESCE(digest_attempts, 0) < 3`,
    [userId],
  );
  return parseInt(row?.count ?? "0", 10);
}

export async function incrementDigestAttempts(id: string): Promise<void> {
  await execute(
    `UPDATE record SET digest_attempts = COALESCE(digest_attempts, 0) + 1, updated_at = now() WHERE id = $1`,
    [id],
  );
}

export async function markDigested(id: string): Promise<void> {
  await execute(
    `UPDATE record SET digested = true, digested_at = now(), updated_at = now() WHERE id = $1`,
    [id],
  );
}

/**
 * 原子抢占：将 digested 从 false 改为 true，仅当当前为 false 时成功。
 * 返回成功抢占的 record ID 列表（已被其他进程抢占的会被过滤掉）。
 */
export async function claimForDigest(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await query<{ id: string }>(
    `UPDATE record SET digested = true, digested_at = now(), updated_at = now()
     WHERE id = ANY($1) AND (digested = false OR digested IS NULL)
     RETURNING id`,
    [ids],
  );
  return rows.map((r) => r.id);
}

/** 回滚：digest 失败时恢复 digested=false，允许下次重试 */
export async function unclaimDigest(id: string): Promise<void> {
  await execute(
    `UPDATE record SET digested = false, digested_at = NULL, updated_at = now() WHERE id = $1`,
    [id],
  );
}

/** 按 user_id + source 查询（用于幂等检查，如欢迎日记判重） */
export async function findByUserAndSource(userId: string, source: string): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE user_id = $1 AND source = $2 ORDER BY created_at ASC`,
    [userId, source],
  );
}

/** 更新 created_at（用于控制欢迎日记排序） */
export async function updateCreatedAt(id: string, createdAt: string): Promise<void> {
  await execute(
    `UPDATE record SET created_at = $2, updated_at = now() WHERE id = $1`,
    [id, createdAt],
  );
}

/** 更新层级标签（L1/L2/L3 涌现结构反向标注） */

export async function updateHierarchyTags(
  id: string,
  tags: Array<{ label: string; level: number }>,
): Promise<void> {
  await execute(
    `UPDATE record SET hierarchy_tags = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(tags), id],
  );
}

export async function findByDeviceAndDateRange(
  deviceId: string,
  start: string,
  end: string,
): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE device_id = $1
     AND created_at >= $2 AND created_at <= $3
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at ASC`,
    [deviceId, start, end],
  );
}

/** 查找待编译的 record（compile_status = 'pending' 或 'needs_recompile'） */
export async function findPendingCompile(userId: string, limit = 30): Promise<Record[]> {
  return query<Record>(
    `SELECT * FROM record WHERE user_id = $1
     AND compile_status IN ('pending', 'needs_recompile')
     AND status = 'completed'
     AND archived = false
     ORDER BY created_at ASC
     LIMIT $2`,
    [userId, limit],
  );
}

/** 更新 record 的编译状态（附带可选的 content_hash） */
export type CompileStatus = "pending" | "compiled" | "skipped" | "needs_recompile";

export async function updateCompileStatus(
  recordId: string,
  status: CompileStatus,
  contentHash?: string,
): Promise<void> {
  if (contentHash !== undefined) {
    await execute(
      `UPDATE record SET compile_status = $1, content_hash = $2, updated_at = now() WHERE id = $3`,
      [status, contentHash, recordId],
    );
  } else {
    await execute(
      `UPDATE record SET compile_status = $1, updated_at = now() WHERE id = $2`,
      [status, recordId],
    );
  }
}

/** 更新 record.metadata（JSONB 合并，不覆盖已有字段） */
export async function mergeMetadata(
  recordId: string,
  patch: { [key: string]: unknown },
): Promise<void> {
  await execute(
    `UPDATE record SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(patch), recordId],
  );
}
