/**
 * wiki_page_link repository — Page 间跨页链接（Phase 14.1 / 14.11）
 *
 * 存储 wiki page 之间的语义关联：reference / related / contradicts
 * UNIQUE(source_page_id, target_page_id, link_type)
 */
import { query, queryOne, execute } from "../pool.js";
import type { Queryable } from "../pool.js";

export interface WikiPageLink {
  id: string;
  source_page_id: string;
  target_page_id: string;
  link_type: "reference" | "related" | "contradicts";
  context_text: string | null;
  created_at: string;
}

/** 创建跨页链接（冲突时更新 context_text，保证始终返回行） */
export async function createLink(fields: {
  source_page_id: string;
  target_page_id: string;
  link_type: "reference" | "related" | "contradicts";
  context_text?: string;
}, client?: Queryable): Promise<WikiPageLink> {
  const row = await queryOne<WikiPageLink>(
    `INSERT INTO wiki_page_link (source_page_id, target_page_id, link_type, context_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_page_id, target_page_id, link_type)
     DO UPDATE SET context_text = EXCLUDED.context_text
     RETURNING *`,
    [
      fields.source_page_id,
      fields.target_page_id,
      fields.link_type,
      fields.context_text ?? null,
    ],
    client,
  );
  return row!;
}

/** 查找从某 page 出发的所有链接 */
export async function findBySource(
  sourcePageId: string,
): Promise<WikiPageLink[]> {
  return query<WikiPageLink>(
    `SELECT * FROM wiki_page_link WHERE source_page_id = $1 ORDER BY created_at DESC`,
    [sourcePageId],
  );
}

/** 查找指向某 page 的所有链接 */
export async function findByTarget(
  targetPageId: string,
): Promise<WikiPageLink[]> {
  return query<WikiPageLink>(
    `SELECT * FROM wiki_page_link WHERE target_page_id = $1 ORDER BY created_at DESC`,
    [targetPageId],
  );
}

/** 查找与某 page 相关的所有链接（出发或到达） */
export async function findByPage(
  pageId: string,
): Promise<WikiPageLink[]> {
  return query<WikiPageLink>(
    `SELECT * FROM wiki_page_link
     WHERE source_page_id = $1 OR target_page_id = $1
     ORDER BY created_at DESC`,
    [pageId],
  );
}

/** 删除链接 */
export async function removeLink(id: string): Promise<void> {
  await execute(
    `DELETE FROM wiki_page_link WHERE id = $1`,
    [id],
  );
}
