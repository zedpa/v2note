import { query, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM skill_config WHERE device_id = $1`, [deviceId]);
}
export async function findByUser(userId) {
    return query(`SELECT * FROM skill_config WHERE user_id = $1`, [userId]);
}
/** @deprecated 使用 upsertByUser 替代 */
export async function upsert(fields) {
    if (fields.user_id) {
        return upsertByUser({ ...fields, user_id: fields.user_id });
    }
    // 无 user_id 的遗留路径：查找后 update 或 insert
    const configJson = fields.config ? JSON.stringify(fields.config) : "{}";
    const [existing] = await query(`SELECT * FROM skill_config WHERE device_id = $1 AND skill_name = $2 LIMIT 1`, [fields.device_id, fields.skill_name]);
    if (existing) {
        await execute(`UPDATE skill_config SET enabled = $1, config = $2 WHERE id = $3`, [fields.enabled, configJson, existing.id]);
    }
    else {
        await execute(`INSERT INTO skill_config (device_id, skill_name, enabled, config) VALUES ($1, $2, $3, $4)`, [fields.device_id, fields.skill_name, fields.enabled, configJson]);
    }
}
export async function upsertByUser(fields) {
    const configJson = fields.config ? JSON.stringify(fields.config) : "{}";
    // 优先按 user_id + skill_name 查找
    const [existing] = await query(`SELECT * FROM skill_config WHERE user_id = $1 AND skill_name = $2 LIMIT 1`, [fields.user_id, fields.skill_name]);
    if (existing) {
        await execute(`UPDATE skill_config SET enabled = $1, config = $2, device_id = $3 WHERE id = $4`, [fields.enabled, configJson, fields.device_id, existing.id]);
        return;
    }
    // 按 device_id 查找旧数据并补绑 user_id
    const [byDevice] = await query(`SELECT * FROM skill_config WHERE device_id = $1 AND skill_name = $2 AND user_id IS NULL LIMIT 1`, [fields.device_id, fields.skill_name]);
    if (byDevice) {
        await execute(`UPDATE skill_config SET user_id = $1, enabled = $2, config = $3 WHERE id = $4`, [fields.user_id, fields.enabled, configJson, byDevice.id]);
        return;
    }
    await execute(`INSERT INTO skill_config (user_id, device_id, skill_name, enabled, config) VALUES ($1, $2, $3, $4, $5)`, [fields.user_id, fields.device_id, fields.skill_name, fields.enabled, configJson]);
}
//# sourceMappingURL=skill-config.js.map