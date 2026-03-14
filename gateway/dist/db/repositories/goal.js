import { query, queryOne, execute } from "../pool.js";
export async function findActiveByDevice(deviceId) {
    return query(`SELECT * FROM goal WHERE device_id = $1 AND status = 'active' ORDER BY created_at DESC`, [deviceId]);
}
export async function findActiveByUser(userId) {
    return query(`SELECT * FROM goal WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`, [userId]);
}
export async function findByUser(userId) {
    return query(`SELECT * FROM goal WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
}
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM goal WHERE device_id = $1 ORDER BY created_at DESC`, [deviceId]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM goal WHERE id = $1`, [id]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO goal (device_id, title, parent_id, source) VALUES ($1, $2, $3, $4) RETURNING *`, [fields.device_id, fields.title, fields.parent_id ?? null, fields.source ?? "speech"]);
    return row;
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.title !== undefined) {
        sets.push(`title = $${i++}`);
        params.push(fields.title);
    }
    if (fields.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(fields.status);
    }
    if (fields.parent_id !== undefined) {
        sets.push(`parent_id = $${i++}`);
        params.push(fields.parent_id);
    }
    if (sets.length === 0)
        return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await execute(`UPDATE goal SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
export async function findWithTodos(goalId) {
    const todos = await query(`SELECT id, text, done FROM todo WHERE goal_id = $1 ORDER BY created_at`, [goalId]);
    return todos;
}
//# sourceMappingURL=goal.js.map