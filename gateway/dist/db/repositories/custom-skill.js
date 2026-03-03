import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM custom_skill WHERE device_id = $1 ORDER BY created_at`, [deviceId]);
}
export async function findByDeviceAndName(deviceId, name) {
    return queryOne(`SELECT * FROM custom_skill WHERE device_id = $1 AND name = $2`, [deviceId, name]);
}
export async function create(fields) {
    const rows = await query(`INSERT INTO custom_skill (device_id, name, description, prompt, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [
        fields.device_id,
        fields.name,
        fields.description ?? "",
        fields.prompt,
        fields.type ?? "review",
        fields.created_by ?? "user",
    ]);
    return rows[0];
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
    if (fields.prompt !== undefined) {
        sets.push(`prompt = $${idx++}`);
        params.push(fields.prompt);
    }
    if (fields.type !== undefined) {
        sets.push(`type = $${idx++}`);
        params.push(fields.type);
    }
    if (fields.enabled !== undefined) {
        sets.push(`enabled = $${idx++}`);
        params.push(fields.enabled);
    }
    if (sets.length === 0)
        return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await execute(`UPDATE custom_skill SET ${sets.join(", ")} WHERE id = $${idx}`, params);
}
export async function deleteById(id) {
    return execute(`DELETE FROM custom_skill WHERE id = $1`, [id]);
}
export async function deleteByName(deviceId, name) {
    return execute(`DELETE FROM custom_skill WHERE device_id = $1 AND name = $2`, [deviceId, name]);
}
//# sourceMappingURL=custom-skill.js.map