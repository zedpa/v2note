import { queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return queryOne(`SELECT * FROM soul WHERE device_id = $1`, [deviceId]);
}
export async function findByUser(userId) {
    return queryOne(`SELECT * FROM soul WHERE user_id = $1`, [userId]);
}
export async function upsertByUser(userId, content) {
    // Use the partial unique index idx_soul_user_id_unique
    const existing = await findByUser(userId);
    if (existing) {
        await execute(`UPDATE soul SET content = $1, updated_at = now() WHERE id = $2`, [content, existing.id]);
    }
    else {
        await execute(`INSERT INTO soul (user_id, content) VALUES ($1, $2)`, [userId, content]);
    }
}
export async function upsert(deviceId, content) {
    await execute(`INSERT INTO soul (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`, [deviceId, content]);
}
//# sourceMappingURL=soul.js.map