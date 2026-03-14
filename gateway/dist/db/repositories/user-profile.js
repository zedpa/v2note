import { queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return queryOne(`SELECT * FROM user_profile WHERE device_id = $1`, [deviceId]);
}
export async function findByUser(userId) {
    return queryOne(`SELECT * FROM user_profile WHERE user_id = $1`, [userId]);
}
export async function upsertByUser(userId, content) {
    const existing = await findByUser(userId);
    if (existing) {
        await execute(`UPDATE user_profile SET content = $1, updated_at = now() WHERE id = $2`, [content, existing.id]);
    }
    else {
        await execute(`INSERT INTO user_profile (user_id, content) VALUES ($1, $2)`, [userId, content]);
    }
}
export async function upsert(deviceId, content) {
    await execute(`INSERT INTO user_profile (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`, [deviceId, content]);
}
//# sourceMappingURL=user-profile.js.map