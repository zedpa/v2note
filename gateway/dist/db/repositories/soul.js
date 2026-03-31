import { queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return queryOne(`SELECT * FROM soul WHERE device_id = $1`, [deviceId]);
}
export async function findByUser(userId) {
    return queryOne(`SELECT * FROM soul WHERE user_id = $1`, [userId]);
}
export async function upsertByUser(userId, content, deviceId) {
    let existing = await findByUser(userId);
    // 按 device_id 查找旧数据并补绑 user_id
    if (!existing && deviceId) {
        existing = await findByDevice(deviceId);
        if (existing) {
            await execute(`UPDATE soul SET user_id = $1 WHERE id = $2`, [userId, existing.id]);
        }
    }
    if (existing) {
        await execute(`UPDATE soul SET content = $1, updated_at = now() WHERE id = $2`, [content, existing.id]);
    }
    else {
        await execute(`INSERT INTO soul (user_id, device_id, content) VALUES ($1, $2, $3)`, [userId, deviceId ?? null, content]);
    }
}
/** @deprecated 使用 upsertByUser 替代 */
export async function upsert(deviceId, content) {
    const existing = await findByDevice(deviceId);
    if (existing) {
        await execute(`UPDATE soul SET content = $1, updated_at = now() WHERE id = $2`, [content, existing.id]);
    }
    else {
        await execute(`INSERT INTO soul (device_id, content) VALUES ($1, $2)`, [deviceId, content]);
    }
}
//# sourceMappingURL=soul.js.map