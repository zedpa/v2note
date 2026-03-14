import { query, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM skill_config WHERE device_id = $1`, [deviceId]);
}
export async function findByUser(userId) {
    return query(`SELECT * FROM skill_config WHERE user_id = $1`, [userId]);
}
export async function upsert(fields) {
    await execute(`INSERT INTO skill_config (device_id, user_id, skill_name, enabled, config)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id, skill_name)
     DO UPDATE SET enabled = $4, config = $5, user_id = COALESCE($2, skill_config.user_id)`, [
        fields.device_id,
        fields.user_id ?? null,
        fields.skill_name,
        fields.enabled,
        fields.config ? JSON.stringify(fields.config) : "{}",
    ]);
}
export async function upsertByUser(fields) {
    await execute(`INSERT INTO skill_config (user_id, device_id, skill_name, enabled, config)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id, skill_name)
     DO UPDATE SET enabled = $4, config = $5, user_id = $1`, [
        fields.user_id,
        fields.device_id,
        fields.skill_name,
        fields.enabled,
        fields.config ? JSON.stringify(fields.config) : "{}",
    ]);
}
//# sourceMappingURL=skill-config.js.map