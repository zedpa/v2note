import { query, queryOne, execute } from "../pool.js";
export async function findPendingByDevice(deviceId) {
    return query(`SELECT * FROM pending_intent WHERE device_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [deviceId]);
}
export async function findPendingByUser(userId) {
    return query(`SELECT * FROM pending_intent WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [userId]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM pending_intent WHERE id = $1`, [id]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO pending_intent (device_id, record_id, intent_type, text, context) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [fields.device_id, fields.record_id ?? null, fields.intent_type, fields.text, fields.context ?? null]);
    return row;
}
export async function updateStatus(id, status, promotedTo) {
    await execute(`UPDATE pending_intent SET status = $1, promoted_to = $2 WHERE id = $3`, [status, promotedTo ?? null, id]);
}
//# sourceMappingURL=pending-intent.js.map