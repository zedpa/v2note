/**
 * Page 分级授权 — Phase 14.7
 *
 * AI 对 created_by='ai' 的 page 可自主执行结构操作，
 * 对 created_by='user' 的 page 需创建 suggestion 等待用户确认。
 */
import { query, queryOne, execute } from "../db/pool.js";
import type { WikiPage } from "../db/repositories/wiki-page.js";

export interface Suggestion {
  id: string;
  user_id: string;
  suggestion_type: "split" | "merge" | "rename" | "archive";
  payload: Record<string, any>;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

/**
 * 检查 AI 是否可自主修改 page 结构
 * created_by='ai' → true（可自主操作）
 * created_by='user' → false（需用户授权）
 */
export function canAiModifyStructure(page: Pick<WikiPage, "created_by">): boolean {
  return page.created_by === "ai";
}

/**
 * 创建结构修改建议，等待用户确认
 */
export async function createSuggestion(
  userId: string,
  type: Suggestion["suggestion_type"],
  payload: Record<string, any>,
): Promise<Suggestion> {
  const row = await queryOne<Suggestion>(
    `INSERT INTO wiki_compile_suggestion (user_id, suggestion_type, payload)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, suggestion_type, payload, status, created_at`,
    [userId, type, JSON.stringify(payload)],
  );
  return row!;
}

/**
 * 接受建议 — 将 status 更新为 accepted
 * 注意：实际执行预编译方案的逻辑由调用方处理
 */
export async function acceptSuggestion(id: string, userId: string): Promise<void> {
  await execute(
    `UPDATE wiki_compile_suggestion SET status = 'accepted' WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId],
  );
}

/**
 * 拒绝建议 — 将 status 更新为 rejected
 */
export async function rejectSuggestion(id: string, userId: string): Promise<void> {
  await execute(
    `UPDATE wiki_compile_suggestion SET status = 'rejected' WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId],
  );
}

/**
 * 获取用户的待处理建议
 */
export async function getPendingSuggestions(userId: string): Promise<Suggestion[]> {
  return query<Suggestion>(
    `SELECT id, user_id, suggestion_type, payload, status, created_at
     FROM wiki_compile_suggestion
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [userId],
  );
}
