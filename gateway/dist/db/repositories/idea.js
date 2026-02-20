import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT i.* FROM idea i
     JOIN record r ON r.id = i.record_id
     WHERE r.device_id = $1
     ORDER BY i.created_at DESC`, [deviceId]);
}
export async function findByRecordId(recordId) {
    return query(`SELECT * FROM idea WHERE record_id = $1 ORDER BY created_at`, [recordId]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO idea (record_id, text) VALUES ($1, $2) RETURNING *`, [fields.record_id, fields.text]);
    return row;
}
export async function del(id) {
    await execute(`DELETE FROM idea WHERE id = $1`, [id]);
}
//# sourceMappingURL=idea.js.map