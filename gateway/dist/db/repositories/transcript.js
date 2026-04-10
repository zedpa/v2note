import { query, queryOne } from "../pool.js";
export async function findByRecordId(recordId) {
    return queryOne(`SELECT * FROM transcript WHERE record_id = $1`, [recordId]);
}
export async function findByRecordIds(recordIds) {
    if (recordIds.length === 0)
        return [];
    const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(", ");
    return query(`SELECT * FROM transcript WHERE record_id IN (${placeholders})`, recordIds);
}
export async function update(recordId, fields) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (fields.text !== undefined) {
        sets.push(`text = $${i++}`);
        vals.push(fields.text);
    }
    if (fields.language !== undefined) {
        sets.push(`language = $${i++}`);
        vals.push(fields.language);
    }
    if (sets.length === 0)
        return;
    vals.push(recordId);
    await query(`UPDATE transcript SET ${sets.join(", ")} WHERE record_id = $${i}`, vals);
}
/**
 * 查找近 N 秒内同用户/设备是否已有相同内容的记录（幂等性去重）。
 */
export async function findRecentByContent(ownerIdOrDevice, content, withinSeconds) {
    return queryOne(`SELECT t.record_id FROM transcript t
     JOIN record r ON r.id = t.record_id
     WHERE (r.user_id = $1 OR r.device_id = $1)
       AND t.text = $2
       AND t.created_at > NOW() - INTERVAL '1 second' * $3
     LIMIT 1`, [ownerIdOrDevice, content, withinSeconds]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO transcript (record_id, text, language) VALUES ($1, $2, $3) RETURNING *`, [fields.record_id, fields.text, fields.language ?? null]);
    return row;
}
//# sourceMappingURL=transcript.js.map