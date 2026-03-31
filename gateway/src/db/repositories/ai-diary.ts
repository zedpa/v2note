import { query, queryOne, execute } from "../pool.js";

export interface AiDiary {
  id: string;
  device_id: string;
  notebook: string;
  entry_date: string;
  summary: string;
  full_content: string;
  created_at: string;
  updated_at: string;
}

/**
 * Upsert a diary entry — append content to today's entry.
 * 优先按 user_id 维度去重，无 user_id 时回退到 device_id。
 */
export async function upsertEntry(
  deviceId: string,
  notebook: string,
  date: string,
  content: string,
  userId?: string,
): Promise<AiDiary> {
  // 有 user_id → 按 user_id 维度查找/更新
  if (userId) {
    const existing = await findByUser(userId, notebook, date);
    if (existing) {
      const row = await queryOne<AiDiary>(
        `UPDATE ai_diary SET
           full_content = full_content || E'\\n\\n' || $1,
           summary = LEFT(full_content || E'\\n\\n' || $1, 200),
           device_id = $2,
           updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [content, deviceId, existing.id],
      );
      return row!;
    }
    // 可能有旧的 device_id 数据未绑 user_id
    const byDevice = await queryOne<AiDiary>(
      `SELECT * FROM ai_diary WHERE device_id = $1 AND notebook = $2 AND entry_date = $3 AND user_id IS NULL`,
      [deviceId, notebook, date],
    );
    if (byDevice) {
      const row = await queryOne<AiDiary>(
        `UPDATE ai_diary SET
           user_id = $1,
           full_content = full_content || E'\\n\\n' || $2,
           summary = LEFT(full_content || E'\\n\\n' || $2, 200),
           updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [userId, content, byDevice.id],
      );
      return row!;
    }
    const row = await queryOne<AiDiary>(
      `INSERT INTO ai_diary (device_id, user_id, notebook, entry_date, full_content, summary)
       VALUES ($1, $2, $3, $4, $5, LEFT($5, 200))
       RETURNING *`,
      [deviceId, userId, notebook, date, content],
    );
    return row!;
  }

  // 无 user_id → 旧的 device_id 路径
  const existing = await findFull(deviceId, notebook, date);
  if (existing) {
    const row = await queryOne<AiDiary>(
      `UPDATE ai_diary SET
         full_content = full_content || E'\\n\\n' || $1,
         summary = LEFT(full_content || E'\\n\\n' || $1, 200),
         updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [content, existing.id],
    );
    return row!;
  }
  const row = await queryOne<AiDiary>(
    `INSERT INTO ai_diary (device_id, notebook, entry_date, full_content, summary)
     VALUES ($1, $2, $3, $4, LEFT($4, 200))
     RETURNING *`,
    [deviceId, notebook, date, content],
  );
  return row!;
}

export async function findByUser(
  userId: string,
  notebook: string,
  date: string,
): Promise<AiDiary | null> {
  return queryOne<AiDiary>(
    `SELECT * FROM ai_diary WHERE user_id = $1 AND notebook = $2 AND entry_date = $3`,
    [userId, notebook, date],
  );
}

/**
 * Get all diary entries for a specific date across all notebooks.
 */
export async function findByDate(
  deviceId: string,
  date: string,
): Promise<AiDiary[]> {
  return query<AiDiary>(
    `SELECT * FROM ai_diary WHERE device_id = $1 AND entry_date = $2 ORDER BY notebook`,
    [deviceId, date],
  );
}

/**
 * Get diary summaries for a notebook within a date range (lazy loading).
 */
export async function findSummaries(
  deviceId: string,
  notebook: string,
  startDate: string,
  endDate: string,
): Promise<Pick<AiDiary, "id" | "entry_date" | "summary" | "notebook">[]> {
  return query(
    `SELECT id, entry_date,
            COALESCE(NULLIF(summary, ''), LEFT(full_content, 200)) AS summary,
            notebook
     FROM ai_diary
     WHERE device_id = $1 AND notebook = $2 AND entry_date >= $3 AND entry_date <= $4
     ORDER BY entry_date DESC`,
    [deviceId, notebook, startDate, endDate],
  );
}

export async function findSummariesByUser(
  userId: string,
  notebook: string,
  startDate: string,
  endDate: string,
): Promise<Pick<AiDiary, "id" | "entry_date" | "summary" | "notebook">[]> {
  return query(
    `SELECT id, entry_date,
            COALESCE(NULLIF(summary, ''), LEFT(full_content, 200)) AS summary,
            notebook
     FROM ai_diary
     WHERE user_id = $1 AND notebook = $2 AND entry_date >= $3 AND entry_date <= $4
     ORDER BY entry_date DESC`,
    [userId, notebook, startDate, endDate],
  );
}

/**
 * Get full content of a specific diary entry.
 */
export async function findFull(
  deviceId: string,
  notebook: string,
  date: string,
): Promise<AiDiary | null> {
  return queryOne<AiDiary>(
    `SELECT * FROM ai_diary WHERE device_id = $1 AND notebook = $2 AND entry_date = $3`,
    [deviceId, notebook, date],
  );
}

export async function findFullByUser(
  userId: string,
  notebook: string,
  date: string,
): Promise<AiDiary | null> {
  return queryOne<AiDiary>(
    `SELECT * FROM ai_diary WHERE user_id = $1 AND notebook = $2 AND entry_date = $3`,
    [userId, notebook, date],
  );
}

/**
 * Update the summary field of a diary entry.
 */
export async function updateSummary(
  id: string,
  summary: string,
): Promise<void> {
  await execute(
    `UPDATE ai_diary SET summary = $1, updated_at = now() WHERE id = $2`,
    [summary, id],
  );
}
