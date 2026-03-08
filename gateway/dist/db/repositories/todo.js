import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1
     ORDER BY t.created_at DESC`, [deviceId]);
}
export async function findByRecordId(recordId) {
    return query(`SELECT * FROM todo WHERE record_id = $1 ORDER BY created_at`, [recordId]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO todo (record_id, text, done) VALUES ($1, $2, $3) RETURNING *`, [fields.record_id, fields.text, fields.done ?? false]);
    return row;
}
export async function createMany(items) {
    if (items.length === 0)
        return;
    const values = [];
    const params = [];
    let i = 1;
    for (const item of items) {
        values.push(`($${i++}, $${i++}, $${i++})`);
        params.push(item.record_id, item.text, item.done ?? false);
    }
    await execute(`INSERT INTO todo (record_id, text, done) VALUES ${values.join(", ")}`, params);
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.text !== undefined) {
        sets.push(`text = $${i++}`);
        params.push(fields.text);
    }
    if (fields.done !== undefined) {
        sets.push(`done = $${i++}`);
        params.push(fields.done);
    }
    if (fields.estimated_minutes !== undefined) {
        sets.push(`estimated_minutes = $${i++}`);
        params.push(fields.estimated_minutes);
    }
    if (fields.scheduled_start !== undefined) {
        sets.push(`scheduled_start = $${i++}`);
        params.push(fields.scheduled_start);
    }
    if (fields.scheduled_end !== undefined) {
        sets.push(`scheduled_end = $${i++}`);
        params.push(fields.scheduled_end);
    }
    if (fields.priority !== undefined) {
        sets.push(`priority = $${i++}`);
        params.push(fields.priority);
    }
    if (fields.domain !== undefined) {
        sets.push(`domain = $${i++}`);
        params.push(fields.domain);
    }
    if (fields.impact !== undefined) {
        sets.push(`impact = $${i++}`);
        params.push(fields.impact);
    }
    if (fields.ai_actionable !== undefined) {
        sets.push(`ai_actionable = $${i++}`);
        params.push(fields.ai_actionable);
    }
    if (fields.ai_action_plan !== undefined) {
        sets.push(`ai_action_plan = $${i++}`);
        params.push(JSON.stringify(fields.ai_action_plan));
    }
    if (sets.length === 0)
        return;
    params.push(id);
    await execute(`UPDATE todo SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
export async function del(id) {
    await execute(`DELETE FROM todo WHERE id = $1`, [id]);
}
export async function toggle(id) {
    return queryOne(`UPDATE todo SET done = NOT done WHERE id = $1 RETURNING *`, [id]);
}
export async function countByDateRange(deviceId, start, end) {
    const row = await queryOne(`SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE t.done)::text AS done
     FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.created_at >= $2 AND t.created_at <= $3`, [deviceId, start, end]);
    return {
        total: parseInt(row?.total ?? "0", 10),
        done: parseInt(row?.done ?? "0", 10),
    };
}
export async function findPendingByDevice(deviceId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.done = false
     ORDER BY t.created_at ASC`, [deviceId]);
}
export async function findRelayByDevice(deviceId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.category = 'relay' AND t.done = false
     ORDER BY t.created_at ASC`, [deviceId]);
}
export async function createWithCategory(fields) {
    const row = await queryOne(`INSERT INTO todo (record_id, text, done, category, relay_meta)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [
        fields.record_id,
        fields.text,
        fields.done ?? false,
        fields.category ?? "action",
        fields.relay_meta ? JSON.stringify(fields.relay_meta) : null,
    ]);
    return row;
}
//# sourceMappingURL=todo.js.map