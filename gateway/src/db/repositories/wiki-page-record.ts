/**
 * wiki_page_record repository — Wiki Page 与 Record 的多对多关联
 *
 * 替代原来的 UUID[] 字段，避免无界增长。
 */
import { query, execute } from "../pool.js";

export interface WikiPageRecord {
  wiki_page_id: string;
  record_id: string;
  added_at: string;
}

/** 关联 wiki page 与 record */
export async function link(
  wikiPageId: string,
  recordId: string,
): Promise<void> {
  await execute(
    `INSERT INTO wiki_page_record (wiki_page_id, record_id)
     VALUES ($1, $2)
     ON CONFLICT (wiki_page_id, record_id) DO NOTHING`,
    [wikiPageId, recordId],
  );
}

/** 解除关联 */
export async function unlink(
  wikiPageId: string,
  recordId: string,
): Promise<void> {
  await execute(
    `DELETE FROM wiki_page_record WHERE wiki_page_id = $1 AND record_id = $2`,
    [wikiPageId, recordId],
  );
}

/** 查找某个 wiki page 关联的所有 record ID */
export async function findRecordsByPage(
  wikiPageId: string,
): Promise<WikiPageRecord[]> {
  return query<WikiPageRecord>(
    `SELECT * FROM wiki_page_record WHERE wiki_page_id = $1
     ORDER BY added_at ASC`,
    [wikiPageId],
  );
}

/** 查找某个 record 关联的所有 wiki page ID */
export async function findPagesByRecord(
  recordId: string,
): Promise<WikiPageRecord[]> {
  return query<WikiPageRecord>(
    `SELECT * FROM wiki_page_record WHERE record_id = $1
     ORDER BY added_at ASC`,
    [recordId],
  );
}

/** 批量查找多个 record 关联的所有 wiki page ID */
export async function findPagesByRecords(
  recordIds: string[],
): Promise<WikiPageRecord[]> {
  if (recordIds.length === 0) return [];
  const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(", ");
  return query<WikiPageRecord>(
    `SELECT * FROM wiki_page_record WHERE record_id IN (${placeholders}) ORDER BY added_at ASC`,
    recordIds,
  );
}

/** 统计某个 wiki page 关联的 record 数量 */
export async function countByPage(wikiPageId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM wiki_page_record WHERE wiki_page_id = $1`,
    [wikiPageId],
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}
