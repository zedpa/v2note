import { query, queryOne, execute } from "../pool.js";
export async function upsert(name) {
    const row = await queryOne(`INSERT INTO tag (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`, [name]);
    return row;
}
export async function findByName(name) {
    const row = await queryOne(`SELECT * FROM tag WHERE name = $1`, [name]);
    return row ?? null;
}
export async function findAll() {
    return query(`SELECT * FROM tag ORDER BY name`);
}
export async function findByRecordId(recordId) {
    return query(`SELECT t.* FROM tag t
     JOIN record_tag rt ON rt.tag_id = t.id
     WHERE rt.record_id = $1`, [recordId]);
}
export async function addToRecord(recordId, tagId) {
    await execute(`INSERT INTO record_tag (record_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (record_id, tag_id) DO NOTHING`, [recordId, tagId]);
}
export async function removeFromRecord(recordId, tagId) {
    await execute(`DELETE FROM record_tag WHERE record_id = $1 AND tag_id = $2`, [recordId, tagId]);
}
//# sourceMappingURL=tag.js.map