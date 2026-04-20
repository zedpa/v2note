/**
 * 目标质量清理阶段 — 每日维护阶段 6
 *
 * 3 条硬规则（无 AI，纯 SQL）：
 * 1. 过期 suggested（14 天未确认）→ dismissed
 * 2. 空壳目标（无子任务 + 超 7 天）→ dismissed
 * 3. 精确文本去重（LOWER(TRIM(text))，保留最早的）
 *
 * 每条规则执行后同步归档关联的 wiki_page。
 *
 * 注：SQL 中使用 NOW() 而非 JS new Date()，DB 连接池已设 timezone = 'Asia/Shanghai'。
 */

import { query, execute } from "../db/pool.js";

export interface GoalQualityResult {
  suggestedDismissed: number;
  hollowDismissed: number;
  duplicatesMerged: number;
}

/**
 * 执行目标质量清理（per-user）。
 * 返回各规则清理数量。
 */
export async function runGoalQualityCleanup(userId: string): Promise<GoalQualityResult> {
  const result: GoalQualityResult = {
    suggestedDismissed: 0,
    hollowDismissed: 0,
    duplicatesMerged: 0,
  };

  // ── Rule 1: 过期 suggested（14 天未确认）──
  const rule1Dismissed = await query<{ id: string; wiki_page_id: string | null }>(
    `UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
     WHERE user_id = $1 AND level >= 1
       AND status = 'suggested'
       AND created_at < NOW() - INTERVAL '14 days'
     RETURNING id, wiki_page_id`,
    [userId],
  );
  result.suggestedDismissed = rule1Dismissed.length;

  // 归档关联 wiki_page
  await archiveWikiPages(rule1Dismissed);

  // ── Rule 2: 空壳目标（无子任务 + 超 7 天）──
  const rule2Dismissed = await query<{ id: string; wiki_page_id: string | null }>(
    `UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
     WHERE user_id = $1 AND level >= 1
       AND done = false
       AND status NOT IN ('completed', 'abandoned', 'dismissed', 'suggested')
       AND created_at < NOW() - INTERVAL '7 days'
       AND NOT EXISTS (SELECT 1 FROM todo child WHERE child.parent_id = todo.id)
     RETURNING id, wiki_page_id`,
    [userId],
  );
  result.hollowDismissed = rule2Dismissed.length;

  // 归档关联 wiki_page
  await archiveWikiPages(rule2Dismissed);

  // ── Rule 3: 精确文本去重（保留最早的）──
  // 找到重复组
  const duplicateGroups = await query<{ normalized_text: string; ids: string[] }>(
    `SELECT LOWER(TRIM(text)) AS normalized_text,
            array_agg(id ORDER BY created_at ASC) AS ids
     FROM todo
     WHERE user_id = $1 AND level >= 1
       AND done = false
       AND status NOT IN ('completed', 'abandoned', 'dismissed')
     GROUP BY LOWER(TRIM(text))
     HAVING COUNT(*) > 1`,
    [userId],
  );

  for (const group of duplicateGroups) {
    const keepId = group.ids[0];
    const dismissIds = group.ids.slice(1);

    // 迁移子任务到保留目标
    await execute(
      `UPDATE todo SET parent_id = $1, updated_at = now()
       WHERE parent_id = ANY($2)`,
      [keepId, dismissIds],
    );

    // 迁移 wiki_page_record：被清退目标的 wiki_page 的 record 转移到保留目标的 wiki_page
    const keepGoal = await query<{ wiki_page_id: string | null }>(
      `SELECT wiki_page_id FROM todo WHERE id = $1`,
      [keepId],
    );
    const dismissedGoals = await query<{ id: string; wiki_page_id: string | null }>(
      `SELECT id, wiki_page_id FROM todo WHERE id = ANY($1)`,
      [dismissIds],
    );

    const keepWikiPageId = keepGoal[0]?.wiki_page_id;
    if (keepWikiPageId) {
      const dismissedWikiPageIds = dismissedGoals
        .map(g => g.wiki_page_id)
        .filter((pid): pid is string => pid != null);
      if (dismissedWikiPageIds.length > 0) {
        await execute(
          `UPDATE wiki_page_record SET wiki_page_id = $1
           WHERE wiki_page_id = ANY($2)`,
          [keepWikiPageId, dismissedWikiPageIds],
        );
      }
    }

    // 清退重复项
    const dismissed = await query<{ id: string; wiki_page_id: string | null }>(
      `UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
       WHERE id = ANY($1)
       RETURNING id, wiki_page_id`,
      [dismissIds],
    );

    // 归档关联 wiki_page
    await archiveWikiPages(dismissed);

    result.duplicatesMerged += dismissIds.length;
  }

  return result;
}

/** 归档被清退目标关联的 wiki_page */
async function archiveWikiPages(
  dismissed: Array<{ id: string; wiki_page_id: string | null }>,
): Promise<void> {
  const wikiPageIds = dismissed
    .map(d => d.wiki_page_id)
    .filter((id): id is string => id != null);

  if (wikiPageIds.length > 0) {
    await execute(
      `UPDATE wiki_page SET status = 'archived', updated_at = now()
       WHERE id = ANY($1) AND status = 'active'`,
      [wikiPageIds],
    );
  }
}
