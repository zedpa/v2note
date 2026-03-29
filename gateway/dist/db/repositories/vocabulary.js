/**
 * domain_vocabulary CRUD — 领域词汇表管理
 */
import { query, queryOne, execute } from "../pool.js";
// ── Read ───────────────────────────────────────────────────────────────
/** 按设备查询所有词汇 */
export async function findByDevice(deviceId) {
    return query(`SELECT * FROM domain_vocabulary WHERE device_id = $1 ORDER BY domain, term`, [deviceId]);
}
/** 按用户查询所有词汇 */
export async function findByUser(userId) {
    return query(`SELECT * FROM domain_vocabulary WHERE user_id = $1 ORDER BY domain, term`, [userId]);
}
/** 搜索 aliases 数组中包含指定文本的词条（精确匹配 ANY） */
export async function findByAliases(deviceId, text) {
    return query(`SELECT * FROM domain_vocabulary WHERE device_id = $1 AND $2 = ANY(aliases)`, [deviceId, text]);
}
// ── Write ──────────────────────────────────────────────────────────────
/** 创建词汇条目 */
export async function create(input) {
    const row = await queryOne(`INSERT INTO domain_vocabulary (device_id, user_id, term, aliases, domain, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [
        input.deviceId,
        input.userId ?? null,
        input.term,
        input.aliases ?? [],
        input.domain,
        input.source ?? "user",
    ]);
    return row;
}
/** 删除词汇条目 */
export async function deleteById(id) {
    return execute(`DELETE FROM domain_vocabulary WHERE id = $1`, [id]);
}
/** 增加使用频率 */
export async function incrementFrequency(id) {
    await execute(`UPDATE domain_vocabulary SET frequency = frequency + 1 WHERE id = $1`, [id]);
}
//# sourceMappingURL=vocabulary.js.map