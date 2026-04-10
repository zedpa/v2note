/**
 * wiki_page_record repository — Wiki Page 与 Record 的多对多关联
 *
 * 替代原来的 UUID[] 字段，避免无界增长。
 */
import { query, execute } from "../pool.js";
/** 关联 wiki page 与 record */
export async function link(wikiPageId, recordId) {
    await execute(`INSERT INTO wiki_page_record (wiki_page_id, record_id)
     VALUES ($1, $2)
     ON CONFLICT (wiki_page_id, record_id) DO NOTHING`, [wikiPageId, recordId]);
}
/** 解除关联 */
export async function unlink(wikiPageId, recordId) {
    await execute(`DELETE FROM wiki_page_record WHERE wiki_page_id = $1 AND record_id = $2`, [wikiPageId, recordId]);
}
/** 查找某个 wiki page 关联的所有 record ID */
export async function findRecordsByPage(wikiPageId) {
    return query(`SELECT * FROM wiki_page_record WHERE wiki_page_id = $1
     ORDER BY added_at ASC`, [wikiPageId]);
}
/** 查找某个 record 关联的所有 wiki page ID */
export async function findPagesByRecord(recordId) {
    return query(`SELECT * FROM wiki_page_record WHERE record_id = $1
     ORDER BY added_at ASC`, [recordId]);
}
/** 统计某个 wiki page 关联的 record 数量 */
export async function countByPage(wikiPageId) {
    const rows = await query(`SELECT COUNT(*)::text AS count FROM wiki_page_record WHERE wiki_page_id = $1`, [wikiPageId]);
    return parseInt(rows[0]?.count ?? "0", 10);
}
//# sourceMappingURL=wiki-page-record.js.map