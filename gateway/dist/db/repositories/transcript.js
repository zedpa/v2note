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
export async function create(fields) {
    const row = await queryOne(`INSERT INTO transcript (record_id, text, language) VALUES ($1, $2, $3) RETURNING *`, [fields.record_id, fields.text, fields.language ?? null]);
    return row;
}
//# sourceMappingURL=transcript.js.map