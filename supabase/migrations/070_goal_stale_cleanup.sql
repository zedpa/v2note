-- 070: 历史低质量目标清理 + DROP todo.cluster_id
-- 关联 spec: fix-goal-stale-cleanup.md
-- 注意: DROP cluster_id 后必须清理 gateway/src 中所有 cluster_id 引用（Phase 4）

BEGIN;

-- ══════════════════════════════════════════════════════════════════════
-- Step 1: 空壳目标清退（无子任务 + 创建超 7 天）
-- ══════════════════════════════════════════════════════════════════════

-- 1a. 清退空壳目标
WITH hollow_goals AS (
  UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
  WHERE level >= 1
    AND done = false
    AND status NOT IN ('completed', 'abandoned', 'dismissed', 'suggested')
    AND created_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (SELECT 1 FROM todo child WHERE child.parent_id = todo.id)
  RETURNING id, wiki_page_id
)
-- 1b. 归档关联 wiki_page
UPDATE wiki_page SET status = 'archived', updated_at = now()
WHERE id IN (SELECT wiki_page_id FROM hollow_goals WHERE wiki_page_id IS NOT NULL)
  AND status = 'active';

-- ══════════════════════════════════════════════════════════════════════
-- Step 2: 过期 suggested（创建超 14 天）
-- ══════════════════════════════════════════════════════════════════════

WITH expired_suggested AS (
  UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
  WHERE level >= 1
    AND status = 'suggested'
    AND created_at < NOW() - INTERVAL '14 days'
  RETURNING id, wiki_page_id
)
UPDATE wiki_page SET status = 'archived', updated_at = now()
WHERE id IN (SELECT wiki_page_id FROM expired_suggested WHERE wiki_page_id IS NOT NULL)
  AND status = 'active';

-- ══════════════════════════════════════════════════════════════════════
-- Step 3: 精确文本重复兜底（保留最早的）
-- ══════════════════════════════════════════════════════════════════════

-- 3a. 迁移子任务到保留目标（最早 created_at 的 id）
WITH dup_groups AS (
  SELECT LOWER(TRIM(text)) AS norm_text, user_id,
         (array_agg(id ORDER BY created_at ASC))[1] AS keep_id,
         (array_agg(id ORDER BY created_at ASC))[2:] AS dismiss_ids
  FROM todo
  WHERE level >= 1
    AND done = false
    AND status NOT IN ('completed', 'abandoned', 'dismissed')
  GROUP BY LOWER(TRIM(text)), user_id
  HAVING COUNT(*) > 1
)
UPDATE todo SET parent_id = dg.keep_id, updated_at = now()
FROM dup_groups dg
WHERE todo.parent_id = ANY(dg.dismiss_ids);

-- 3b. 迁移 wiki_page_record（被清退目标的 wiki_page → 保留目标的 wiki_page）
WITH dup_groups AS (
  SELECT LOWER(TRIM(text)) AS norm_text, user_id,
         (array_agg(id ORDER BY created_at ASC))[1] AS keep_id,
         (array_agg(id ORDER BY created_at ASC))[2:] AS dismiss_ids
  FROM todo
  WHERE level >= 1
    AND done = false
    AND status NOT IN ('completed', 'abandoned', 'dismissed')
  GROUP BY LOWER(TRIM(text)), user_id
  HAVING COUNT(*) > 1
),
keeper_pages AS (
  SELECT dg.keep_id, t.wiki_page_id AS keep_wp
  FROM dup_groups dg
  JOIN todo t ON t.id = dg.keep_id
  WHERE t.wiki_page_id IS NOT NULL
),
dismiss_pages AS (
  SELECT kp.keep_wp, t.wiki_page_id AS dismiss_wp
  FROM dup_groups dg
  JOIN keeper_pages kp ON kp.keep_id = dg.keep_id
  JOIN todo t ON t.id = ANY(dg.dismiss_ids)
  WHERE t.wiki_page_id IS NOT NULL
    AND t.wiki_page_id != kp.keep_wp
)
UPDATE wiki_page_record SET wiki_page_id = dp.keep_wp
FROM dismiss_pages dp
WHERE wiki_page_record.wiki_page_id = dp.dismiss_wp;

-- 3c. 清退重复项 + 归档关联 wiki_page
WITH dup_groups AS (
  SELECT LOWER(TRIM(text)) AS norm_text, user_id,
         (array_agg(id ORDER BY created_at ASC))[1] AS keep_id,
         (array_agg(id ORDER BY created_at ASC))[2:] AS dismiss_ids
  FROM todo
  WHERE level >= 1
    AND done = false
    AND status NOT IN ('completed', 'abandoned', 'dismissed')
  GROUP BY LOWER(TRIM(text)), user_id
  HAVING COUNT(*) > 1
),
dismissed AS (
  UPDATE todo SET done = true, status = 'dismissed', updated_at = now()
  WHERE id = ANY(
    SELECT unnest(dismiss_ids) FROM dup_groups
  )
  RETURNING id, wiki_page_id
)
UPDATE wiki_page SET status = 'archived', updated_at = now()
WHERE id IN (SELECT wiki_page_id FROM dismissed WHERE wiki_page_id IS NOT NULL)
  AND status = 'active';

-- ══════════════════════════════════════════════════════════════════════
-- Step 4: DROP todo.cluster_id 孤儿列 + 相关索引
-- ══════════════════════════════════════════════════════════════════════

-- strike 表已被 064_drop_strike_system.sql 删除，
-- todo.cluster_id 所有值已为 NULL（ON DELETE SET NULL）
DROP INDEX IF EXISTS idx_todo_cluster;
ALTER TABLE todo DROP COLUMN IF EXISTS cluster_id;

COMMIT;
