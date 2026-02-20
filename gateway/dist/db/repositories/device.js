import { queryOne, execute } from "../pool.js";
export async function findByIdentifier(identifier) {
    return queryOne(`SELECT * FROM device WHERE device_identifier = $1`, [identifier]);
}
export async function create(identifier, platform) {
    const row = await queryOne(`INSERT INTO device (device_identifier, platform) VALUES ($1, $2) RETURNING *`, [identifier, platform]);
    return row;
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.user_type !== undefined) {
        sets.push(`user_type = $${i++}`);
        params.push(fields.user_type);
    }
    if (fields.custom_tags !== undefined) {
        sets.push(`custom_tags = $${i++}`);
        params.push(JSON.stringify(fields.custom_tags));
    }
    if (sets.length === 0)
        return;
    params.push(id);
    await execute(`UPDATE device SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
//# sourceMappingURL=device.js.map