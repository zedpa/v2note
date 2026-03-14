import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM notebook WHERE device_id = $1 ORDER BY is_system DESC, created_at`, [deviceId]);
}
export async function findByUser(userId) {
    return query(`SELECT * FROM notebook WHERE user_id = $1 ORDER BY is_system DESC, created_at`, [userId]);
}
export async function findOrCreateByUser(userId, deviceId, name, description, isSystem = false, color) {
    const row = await queryOne(`INSERT INTO notebook (user_id, device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (device_id, name) DO UPDATE SET user_id = $1
     RETURNING *`, [userId, deviceId, name, description ?? null, isSystem, color ?? "#6366f1"]);
    return row;
}
export async function findById(id) {
    return queryOne(`SELECT * FROM notebook WHERE id = $1`, [id]);
}
export async function findOrCreate(deviceId, name, description, isSystem = false, color) {
    const row = await queryOne(`INSERT INTO notebook (device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id, name) DO UPDATE SET device_id = notebook.device_id
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