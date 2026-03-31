import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM notebook WHERE device_id = $1 ORDER BY is_system DESC, created_at`, [deviceId]);
}
export async function findByUser(userId) {
    return query(`SELECT * FROM notebook WHERE user_id = $1 ORDER BY is_system DESC, created_at`, [userId]);
}
export async function findOrCreateByUser(userId, deviceId, name, description, isSystem = false, color) {
    // 优先按 user_id + name 查找
    const existing = await queryOne(`SELECT * FROM notebook WHERE user_id = $1 AND name = $2`, [userId, name]);
    if (existing) {
        // 更新最后使用的设备
        if (existing.device_id !== deviceId) {
            await execute(`UPDATE notebook SET device_id = $1 WHERE id = $2`, [deviceId, existing.id]);
        }
        return existing;
    }
    // 按 device_id 查找旧数据并补绑 user_id
    const byDevice = await queryOne(`SELECT * FROM notebook WHERE device_id = $1 AND name = $2 AND user_id IS NULL`, [deviceId, name]);
    if (byDevice) {
        await execute(`UPDATE notebook SET user_id = $1 WHERE id = $2`, [userId, byDevice.id]);
        return { ...byDevice, user_id: userId };
    }
    const row = await queryOne(`INSERT INTO notebook (user_id, device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [userId, deviceId, name, description ?? null, isSystem, color ?? "#6366f1"]);
    return row;
}
export async function findById(id) {
    return queryOne(`SELECT * FROM notebook WHERE id = $1`, [id]);
}
/** @deprecated 使用 findOrCreateByUser 替代 */
export async function findOrCreate(deviceId, name, description, isSystem = false, color) {
    const existing = await queryOne(`SELECT * FROM notebook WHERE device_id = $1 AND name = $2`, [deviceId, name]);
    if (existing)
        return existing;
    const row = await queryOne(`INSERT INTO notebook (device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [deviceId, name, description ?? null, isSystem, color ?? "#6366f1"]);
    return row;
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let idx = 1;
    if (fields.name !== undefined) {
        sets.push(`name = $${idx++}`);
        params.push(fields.name);
    }
    if (fields.description !== undefined) {
        sets.push(`description = $${idx++}`);
        params.push(fields.description);
    }
    if (fields.color !== undefined) {
        sets.push(`color = $${idx++}`);
        params.push(fields.color);
    }
    if (sets.length === 0)
        return findById(id);
    params.push(id);
    return queryOne(`UPDATE notebook SET ${sets.join(", ")} WHERE id = $${idx} AND is_system = false RETURNING *`, params);
}
export async function deleteById(id) {
    const count = await execute(`DELETE FROM notebook WHERE id = $1 AND is_system = false`, [id]);
    return count > 0;
}
/**
 * Ensure system notebooks exist for a device.
 */
export async function ensureSystemNotebooks(deviceId) {
    await findOrCreate(deviceId, "ai-self", "AI 自用工作日记", true, "#8b5cf6");
    await findOrCreate(deviceId, "default", "用户日常日记", true, "#f59e0b");
}
export async function ensureSystemNotebooksByUser(userId, deviceId) {
    await findOrCreateByUser(userId, deviceId, "ai-self", "AI 自用工作日记", true, "#8b5cf6");
    await findOrCreateByUser(userId, deviceId, "default", "用户日常日记", true, "#f59e0b");
}
//# sourceMappingURL=notebook.js.map