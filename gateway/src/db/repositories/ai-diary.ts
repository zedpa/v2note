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
 */
export async function upsertEntry(
  deviceId: string,
  notebook: string,
  date: string,
  content: string,
): Promise<AiDiary> {
  const row = await queryOne<AiDiary>(
    `INSERT INTO ai_diary (device_id, notebook, entry_date, full_content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, notebook, entry_date)
     DO UPDATE SET
       full_content = ai_diary.full_content || E'\\n\\n' || $4,
       updated_at = now()
     RETURNING *`,
    [deviceId, notebook, date, content],
  );
  return row!;
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
    `SELECT id, entry_date, summary, notebook FROM ai_diary
     WHERE device_id = $1 AND notebook = $2 AND entry_date >= $3 AND entry_date <= $4
     ORDER BY entry_date DESC`,
    [deviceId, notebook, startDate, endDate],
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
