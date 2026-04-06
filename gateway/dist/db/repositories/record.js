import { query, queryOne, execute } from "../pool.js";
// v2: 过滤待办页/指令模式创建的隐藏 record（仅用于溯源，不在日记列表展示）
const HIDDEN_SOURCES_CLAUSE = `AND source NOT IN ('todo_voice', 'command_voice')`;
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
     ${HIDDEN_SOURCES_CLAUSE}
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
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`, [...params, limit, offset]);
}
export async function findByUserAndDateRange(userId, start, end) {
    return query(`SELECT * FROM record WHERE user_id = $1
     AND created_at >= $2 AND created_at <= $3
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at ASC`, [userId, start, end]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM record WHERE id = $1`, [id]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO record (device_id, user_id, status, source, source_type, audio_path, duration_seconds, location_text, notebook, file_url, file_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, [
        fields.device_id,
        fields.user_id ?? null,
        fields.status ?? "uploading",
        fields.source ?? "voice",
        fields.source_type ?? "think",
        fields.audio_path ?? null,
        fields.duration_seconds ?? null,
        fields.location_text ?? null,
        fields.notebook ?? null,
        fields.file_url ?? null,
        fields.file_name ?? null,
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
    if (fields.source_type !== undefined) {
        sets.push(`source_type = $${i++}`);
        params.push(fields.source_type);
    }
    if (fields.audio_path !== undefined) {
        sets.push(`audio_path = $${i++}`);
        params.push(fields.audio_path);
    }
    if (fields.file_url !== undefined) {
        sets.push(`file_url = $${i++}`);
        params.push(fields.file_url);
    }
    if (fields.file_name !== undefined) {
        sets.push(`file_name = $${i++}`);
        params.push(fields.file_name);
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
       AND r.source NOT IN ('todo_voice', 'command_voice')
     ORDER BY r.created_at DESC
     LIMIT 50`, [deviceId, `%${q}%`]);
}
export async function searchByUser(userId, q) {
    return query(`SELECT DISTINCT r.* FROM record r
     LEFT JOIN transcript t ON t.record_id = r.id
     LEFT JOIN summary s ON s.record_id = r.id
     WHERE r.user_id = $1
       AND (t.text ILIKE $2 OR s.title ILIKE $2 OR s.short_summary ILIKE $2)
       AND r.source NOT IN ('todo_voice', 'command_voice')
     ORDER BY r.created_at DESC
     LIMIT 50`, [userId, `%${q}%`]);
}
export async function countByUser(userId) {
    const row = await queryOne(`SELECT COUNT(*)::text AS count FROM record WHERE user_id = $1`, [userId]);
    return parseInt(row?.count ?? "0", 10);
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
export async function findUndigested(userId) {
    return query(`SELECT * FROM record WHERE user_id = $1 AND digested = FALSE AND status = 'completed'
       AND COALESCE(digest_attempts, 0) < 3
     ORDER BY created_at ASC`, [userId]);
}
export async function incrementDigestAttempts(id) {
    await execute(`UPDATE record SET digest_attempts = COALESCE(digest_attempts, 0) + 1, updated_at = now() WHERE id = $1`, [id]);
}
export async function markDigested(id) {
    await execute(`UPDATE record SET digested = true, digested_at = now(), updated_at = now() WHERE id = $1`, [id]);
}
/**
 * 原子抢占：将 digested 从 false 改为 true，仅当当前为 false 时成功。
 * 返回成功抢占的 record ID 列表（已被其他进程抢占的会被过滤掉）。
 */
export async function claimForDigest(ids) {
    if (ids.length === 0)
        return [];
    const rows = await query(`UPDATE record SET digested = true, digested_at = now(), updated_at = now()
     WHERE id = ANY($1) AND (digested = false OR digested IS NULL)
     RETURNING id`, [ids]);
    return rows.map((r) => r.id);
}
/** 回滚：digest 失败时恢复 digested=false，允许下次重试 */
export async function unclaimDigest(id) {
    await execute(`UPDATE record SET digested = false, digested_at = NULL, updated_at = now() WHERE id = $1`, [id]);
}
/** 按 user_id + source 查询（用于幂等检查，如欢迎日记判重） */
export async function findByUserAndSource(userId, source) {
    return query(`SELECT * FROM record WHERE user_id = $1 AND source = $2 ORDER BY created_at ASC`, [userId, source]);
}
/** 更新 created_at（用于控制欢迎日记排序） */
export async function updateCreatedAt(id, createdAt) {
    await execute(`UPDATE record SET created_at = $2, updated_at = now() WHERE id = $1`, [id, createdAt]);
}
/** 更新层级标签（L1/L2/L3 涌现结构反向标注） */
/** 更新 record 的自动归类 domain */
export async function updateDomain(id, domain) {
    await execute(`UPDATE record SET domain = $1, updated_at = now() WHERE id = $2`, [domain, id]);
}
/** 查询用户已有的 domain 列表（去重，按使用频次降序） */
export async function listUserDomains(userId) {
    const rows = await query(`SELECT domain FROM record
     WHERE user_id = $1 AND domain IS NOT NULL
     GROUP BY domain ORDER BY count(*) DESC`, [userId]);
    return rows.map(r => r.domain);
}
/** 查询用户 domain 列表 + 计数（供侧边栏文件夹展示） */
export async function listUserDomainsWithCount(userId) {
    return query(`SELECT domain, count(*)::int as count FROM record
     WHERE user_id = $1 AND domain IS NOT NULL
     GROUP BY domain ORDER BY count(*) DESC`, [userId]);
}
/** 批量替换 domain 前缀（rename/merge 用） */
export async function batchUpdateDomain(userId, oldPrefix, newPrefix) {
    // 精确匹配 + 子级路径匹配
    const result = await execute(`UPDATE record SET
       domain = $3 || SUBSTRING(domain FROM LENGTH($2) + 1),
       updated_at = now()
     WHERE user_id = $1 AND (domain = $2 OR domain LIKE $2 || '/%')`, [userId, oldPrefix, newPrefix]);
    return result?.rowCount ?? 0;
}
/** 清空指定前缀的 domain（delete folder 用） */
export async function clearDomainByPrefix(userId, prefix) {
    const result = await execute(`UPDATE record SET domain = NULL, updated_at = now()
     WHERE user_id = $1 AND (domain = $2 OR domain LIKE $2 || '/%')`, [userId, prefix]);
    return result?.rowCount ?? 0;
}
/** 统计未分类记录数 */
export async function countUncategorized(userId) {
    const row = await queryOne(`SELECT count(*)::int as count FROM record
     WHERE user_id = $1 AND domain IS NULL`, [userId]);
    return row?.count ?? 0;
}
export async function updateHierarchyTags(id, tags) {
    await execute(`UPDATE record SET hierarchy_tags = $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(tags), id]);
}
export async function findByDeviceAndDateRange(deviceId, start, end) {
    return query(`SELECT * FROM record WHERE device_id = $1
     AND created_at >= $2 AND created_at <= $3
     ${HIDDEN_SOURCES_CLAUSE}
     ORDER BY created_at ASC`, [deviceId, start, end]);
}
//# sourceMappingURL=record.js.map