/**
 * wiki_page repository — 认知 Wiki 页面 CRUD
 *
 * 每个 wiki_page 代表用户的一个知识主题，由 AI 编译维护。
 * level: L3(顶层) / L2(拆分后) / L1(叶子)
 */
import { query, queryOne, execute } from "../pool.js";
/** 创建 wiki page */
export async function create(fields) {
    const hasEmbedding = fields.embedding && fields.embedding.length > 0;
    const cols = "user_id, title, content, summary, parent_id, level, domain, created_by, metadata" +
        (hasEmbedding ? ", embedding" : "");
    const placeholders = "$1, $2, $3, $4, $5, $6, $7, $8, $9" +
        (hasEmbedding ? ", $10::vector" : "");
    const params = [
        fields.user_id,
        fields.title,
        fields.content ?? "",
        fields.summary ?? null,
        fields.parent_id ?? null,
        fields.level ?? 3,
        fields.domain ?? null,
        fields.created_by ?? "ai",
        JSON.stringify(fields.metadata ?? {}),
    ];
    if (hasEmbedding) {
        params.push(`[${fields.embedding.join(",")}]`);
    }
    const row = await queryOne(`INSERT INTO wiki_page (${cols}) VALUES (${placeholders}) RETURNING *`, params);
    return row;
}
/** 按 ID 查找 */
export async function findById(id) {
    return queryOne(`SELECT * FROM wiki_page WHERE id = $1`, [id]);
}
/** 按用户查找，可过滤 status */
export async function findByUser(userId, opts) {
    const conditions = ["user_id = $1"];
    const params = [userId];
    let i = 2;
    if (opts?.status !== undefined) {
        conditions.push(`status = $${i++}`);
        params.push(opts.status);
    }
    const limit = opts?.limit ?? 100;
    return query(`SELECT * FROM wiki_page WHERE ${conditions.join(" AND ")}
     ORDER BY updated_at DESC LIMIT $${i}`, [...params, limit]);
}
/** 更新 wiki page 可变字段 */
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.title !== undefined) {
        sets.push(`title = $${i++}`);
        params.push(fields.title);
    }
    if (fields.content !== undefined) {
        sets.push(`content = $${i++}`);
        params.push(fields.content);
    }
    if (fields.summary !== undefined) {
        sets.push(`summary = $${i++}`);
        params.push(fields.summary);
    }
    if (fields.level !== undefined) {
        sets.push(`level = $${i++}`);
        params.push(fields.level);
    }
    if (fields.domain !== undefined) {
        sets.push(`domain = $${i++}`);
        params.push(fields.domain);
    }
    if (fields.embedding !== undefined) {
        sets.push(`embedding = $${i++}::vector`);
        params.push(`[${fields.embedding.join(",")}]`);
    }
    if (fields.metadata !== undefined) {
        sets.push(`metadata = $${i++}`);
        params.push(JSON.stringify(fields.metadata));
    }
    if (fields.compiled_at !== undefined) {
        sets.push(`compiled_at = $${i++}`);
        params.push(fields.compiled_at);
    }
    if (sets.length === 0)
        return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await execute(`UPDATE wiki_page SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
/** 更新 status（archived/merged） */
export async function updateStatus(id, status, mergedInto) {
    if (mergedInto) {
        await execute(`UPDATE wiki_page SET status = $1, merged_into = $2, updated_at = now() WHERE id = $3`, [status, mergedInto, id]);
    }
    else {
        await execute(`UPDATE wiki_page SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    }
}
/** 按 parent_id 查找子页面 */
export async function findByParent(parentId) {
    return query(`SELECT * FROM wiki_page WHERE parent_id = $1 AND status = 'active'
     ORDER BY updated_at DESC`, [parentId]);
}
/** 查找用户的顶层页面（level=3） */
export async function findRoots(userId) {
    return query(`SELECT * FROM wiki_page WHERE user_id = $1 AND level = 3 AND status = 'active'
     ORDER BY updated_at DESC`, [userId]);
}
//# sourceMappingURL=wiki-page.js.map