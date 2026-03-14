import { query, queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId, opts) {
    const conditions = [`device_id = $1`];
    const params = [deviceId];
    let i = 2;
    if (opts?.archived !== undefined) {
        conditions.push(`archived = $${i++}`);
        params.push(opts.archived);
    }
    if (opts?.notebook !== undefined) {
        if (opts.notebook === null) {
            conditions.push(`notebook IS NULL`);
        }
        else {
            conditions.push(`notebook = $${i++}`);
            params.push(opts.notebook);
        }
    }
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    return query(`SELECT * FROM record WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`, [...params, limit, offset]);
}
export async function findByUser(userId, opts) {
    const conditions = [`user_id = $1`];
    const params = [userId];
    let i = 2;
    if (opts?.archived !== undefined) {
        conditions.push(`archived = $${i++}`);
        params.push(opts.archived);
    }
    if (opts?.notebook !== undefined) {
        if (opts.notebook === null) {
            conditions.push(`notebook IS NULL`);
        }
        else {
            conditions.push(`notebook = $${i++}`);
            params.push(opts.notebook);
        }
    }
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    return query(`SELECT * FROM record WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`, [...params, limit, offset]);
}
export async function findByUserAndDateRange(userId, start, end) {
    return query(`SELECT * FROM record WHERE user_id = $1
     AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`, [userId, start, end]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM record WHERE id = $1`, [id]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO record (device_id, user_id, status, source, audio_path, duration_seconds, location_text, notebook)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [
        fields.device_id,
        fields.user_id ?? null,
        fields.status ?? "uploading",
        fields.source ?? "voice",
        fields.audio_path ?? null,
        fields.duration_seconds ?? null,
        fields.location_text ?? null,
        fields.notebook ?? null,
    ]);
    return row;
}
export async function updateStatus(id, status) {
    await execute(`UPDATE record SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
}
export async function updateFields(id, fields) {
    const sets = ["updated_at = now()"];
    const params = [];
    let i = 1;
    if (fields.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(fields.status);
    }
    if (fields.archived !== undefined) {
        sets.push(`archived = $${i++}`);
        params.push(fields.archived);
    }
    if (fields.duration_seconds !== undefined) {
        sets.push(`duration_seconds = $${i++}`);
        params.push(fields.duration_seconds);
    }
    params.push(id);
    await execute(`UPDATE record SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
export async function deleteByIds(ids) {
    if (ids.length === 0)
        return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    return execute(`DELETE FROM record WHERE id IN (${placeholders})`, ids);
}
export async function archive(id) {
    await execute(`UPDATE record SET archived = true, updated_at = now() WHERE id = $1`, [id]);
}
export async function search(deviceId, q) {
    return query(`SELECT DISTINCT r.* FROM record r
     LEFT JOIN transcript t ON t.record_id = r.id
     LEFT JOIN summary s ON s.record_id = r.id
     WHERE r.device_id = $1
       AND (t.text ILIKE $2 OR s.title ILIKE $2 OR s.short_summary ILIKE $2)
     ORDER BY r.created_at DESC
     LIMIT 50`, [deviceId, `%${q}%`]);
}
export async function searchByUser(userId, q) {
    return query(`SELECT DISTINCT r.* FROM record r
     LEFT JOIN transcript t ON t.record_id = r.id
     LEFT JOIN summary s ON s.record_id = r.id
     WHERE r.user_id = $1
       AND (t.text ILIKE $2 OR s.title ILIKE $2 OR s.short_summary ILIKE $2)
     ORDER BY r.created_at DESC
     LIMIT 50`, [userId, `%${q}%`]);
}
export async function countByDateRange(deviceId, start, end) {
    const row = await queryOne(`SELECT COUNT(*)::text AS count FROM record
     WHERE device_id = $1 AND created_at >= $2 AND created_at <= $3`, [deviceId, start, end]);
    return parseInt(row?.count ?? "0", 10);
}
export async function countByUserDateRange(userId, start, end) {
    const row = await queryOne(`SELECT COUNT(*)::text AS count FROM record
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`, [userId, start, end]);
    return parseInt(row?.count ?? "0", 10);
}
export async function findByDeviceAndDateRange(deviceId, start, end) {
    return query(`SELECT * FROM record WHERE device_id = $1
     AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at ASC`, [deviceId, start, end]);
}
//# sourceMappingURL=record.js.map