/**
 * wiki_page_event — 知识热力事件记录
 * fire-and-forget 写入，同一 page 同一 event_type 同一天最多 10 条
 */
import { execute, query, queryOne } from "../pool.js";

export type HeatEventType = "compile_hit" | "search_hit" | "view_hit" | "chat_context_hit";

/** 记录一次触碰事件（fire-and-forget，防刷：同一 page+type 每天最多 10 条） */
export async function recordEvent(
  wikiPageId: string,
  eventType: HeatEventType,
): Promise<void> {
  // 防刷检查
  const count = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM wiki_page_event
     WHERE wiki_page_id = $1 AND event_type = $2
       AND created_at >= CURRENT_DATE`,
    [wikiPageId, eventType],
  );
  if ((count?.cnt ?? 0) >= 10) return;

  await execute(
    `INSERT INTO wiki_page_event (wiki_page_id, event_type) VALUES ($1, $2)`,
    [wikiPageId, eventType],
  );
}

/** 事件权重 */
const WEIGHTS: Record<HeatEventType, number> = {
  compile_hit: 3.0,
  search_hit: 1.0,
  view_hit: 0.5,
  chat_context_hit: 2.0,
};

const GOAL_ACTIVE_BONUS = 5.0;
const HALF_LIFE_DAYS = 14;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

/**
 * 每日热力计算 — 纯 SQL + 少量 JS
 * 对指定用户的所有 active wiki page 计算 heat_score + heat_phase
 */
export async function computeHeatScores(userId: string): Promise<void> {
  // 1. 获取所有 active page
  const pages = await query<{ id: string; has_active_goal: boolean }>(
    `SELECT wp.id,
            EXISTS(
              SELECT 1 FROM todo t
              WHERE t.wiki_page_id = wp.id AND t.level >= 1
                AND t.status = 'active' AND t.done = false
            ) AS has_active_goal
     FROM wiki_page wp
     WHERE wp.user_id = $1 AND wp.status = 'active'`,
    [userId],
  );

  if (pages.length === 0) return;

  // 2. 批量获取 90 天内的事件
  const pageIds = pages.map((p) => p.id);
  const events = await query<{
    wiki_page_id: string;
    event_type: HeatEventType;
    days_ago: number;
  }>(
    `SELECT wiki_page_id, event_type,
            EXTRACT(EPOCH FROM now() - created_at) / 86400.0 AS days_ago
     FROM wiki_page_event
     WHERE wiki_page_id = ANY($1)
       AND created_at >= now() - INTERVAL '90 days'`,
    [pageIds],
  );

  // 3. 分 page 计算 heat_score
  const scoreMap = new Map<string, number>();
  for (const p of pages) {
    scoreMap.set(p.id, p.has_active_goal ? GOAL_ACTIVE_BONUS : 0);
  }

  for (const e of events) {
    const weight = WEIGHTS[e.event_type] ?? 0;
    const decay = Math.exp(-LAMBDA * e.days_ago);
    const prev = scoreMap.get(e.wiki_page_id) ?? 0;
    scoreMap.set(e.wiki_page_id, prev + weight * decay);
  }

  // 4. 批量更新
  for (const [pageId, score] of scoreMap) {
    const phase =
      score > 8.0 ? "hot" :
      score >= 3.0 ? "active" :
      score >= 1.0 ? "silent" :
      "frozen";

    await execute(
      `UPDATE wiki_page SET heat_score = $2, heat_phase = $3, updated_at = now()
       WHERE id = $1`,
      [pageId, Math.round(score * 100) / 100, phase],
    );
  }
}

/** 清理 90 天前的事件记录 */
export async function cleanupOldEvents(): Promise<number> {
  const result = await queryOne<{ cnt: number }>(
    `WITH deleted AS (
       DELETE FROM wiki_page_event WHERE created_at < now() - INTERVAL '90 days'
       RETURNING id
     ) SELECT COUNT(*)::int AS cnt FROM deleted`,
  );
  return result?.cnt ?? 0;
}
