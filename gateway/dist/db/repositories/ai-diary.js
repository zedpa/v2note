import { query, queryOne, execute } from "../pool.js";
/**
 * Upsert a diary entry — append content to today's entry.
 */
export async function upsertEntry(deviceId, notebook, date, content) {
    const row = await queryOne(`INSERT INTO ai_diary (device_id, notebook, entry_date, full_content, summary)
     VALUES ($1, $2, $3, $4, LEFT($4, 200))
     ON CONFLICT (device_id, notebook, entry_date)
     DO UPDATE SET
       full_content = ai_diary.full_content || E'\\n\\n' || $4,
       summary = LEFT(ai_diary.full_content || E'\\n\\n' || $4, 200),
       updated_at = now()
     RETURNING *`, [deviceId, notebook, date, content]);
    return row;
}
export async function findByUser(userId, notebook, date) {
    return queryOne(`SELECT * FROM ai_diary WHERE user_id = $1 AND notebook = $2 AND entry_date = $3`, [userId, notebook, date]);
}
/**
 * Get all diary entries for a specific date across all notebooks.
 */
export async function findByDate(deviceId, date) {
    return query(`SELECT * FROM ai_diary WHERE device_id = $1 AND entry_date = $2 ORDER BY notebook`, [deviceId, date]);
}
/**
 * Get diary summaries for a notebook within a date range (lazy loading).
 */
export async function findSummaries(deviceId, notebook, startDate, endDate) {
    return query(`SELECT id, entry_date,
            COALESCE(NULLIF(summary, ''), LEFT(full_content, 200)) AS summary,
            notebook
     FROM ai_diary
     WHERE device_id = $1 AND notebook = $2 AND entry_date >= $3 AND entry_date <= $4
     ORDER BY entry_date DESC`, [deviceId, notebook, startDate, endDate]);
}
/**
 * Get full content of a specific diary entry.
 */
export async function findFull(deviceId, notebook, date) {
    return queryOne(`SELECT * FROM ai_diary WHERE device_id = $1 AND notebook = $2 AND entry_date = $3`, [deviceId, notebook, date]);
}
/**
 * Update the summary field of a diary entry.
 */
export async function updateSummary(id, summary) {
    await execute(`UPDATE ai_diary SET summary = $1, updated_at = now() WHERE id = $2`, [summary, id]);
}
//# sourceMappingURL=ai-diary.js.map