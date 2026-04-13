-- 067: Goal/Wiki Page 数据清洗 — 去重 + 孤儿修复 + 重挂载
-- spec: fix-goal-wiki-data-cleanup.md
-- 幂等：所有操作带 WHERE 条件排除已处理行，可重复执行

-- ═══════════════════════════════════════════════════════
-- Step 0: 回滚快照表
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS _goal_cleanup_snapshot (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  column_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  migrated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- Step 1: 重复 goal todo 合并（场景 1.1）
-- ═══════════════════════════════════════════════════════
-- 同 user_id 下 level>=1 AND done=false 的 todo，按 LOWER(TRIM(text)) 分组
-- 保留 created_at 最早的（主记录），其余标记 done=true, status='completed'
DO $$
DECLARE
  v_group RECORD;
  v_dup RECORD;
  v_primary_wiki RECORD;
  v_dup_wiki RECORD;
  v_merge_count INT := 0;
  v_total_dups INT := 0;
BEGIN
  -- 遍历有重复的分组
  FOR v_group IN
    SELECT user_id, LOWER(TRIM(text)) AS norm_text,
           MIN(created_at) AS earliest,
           COUNT(*) AS cnt
    FROM todo
    WHERE level >= 1 AND done = false
    GROUP BY user_id, LOWER(TRIM(text))
    HAVING COUNT(*) > 1
  LOOP
    v_merge_count := v_merge_count + 1;

    -- 找主记录（最早创建的）
    SELECT id, wiki_page_id INTO v_primary_wiki
    FROM (
      SELECT id, wiki_page_id
      FROM todo
      WHERE user_id = v_group.user_id
        AND LOWER(TRIM(text)) = v_group.norm_text
        AND level >= 1 AND done = false
      ORDER BY created_at ASC
      LIMIT 1
    ) sub;

    -- 处理重复记录
    FOR v_dup IN
      SELECT id, wiki_page_id
      FROM todo
      WHERE user_id = v_group.user_id
        AND LOWER(TRIM(text)) = v_group.norm_text
        AND level >= 1 AND done = false
        AND id != v_primary_wiki.id
      ORDER BY created_at ASC
    LOOP
      v_total_dups := v_total_dups + 1;

      -- 快照：done
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('todo', v_dup.id, 'done', 'false', 'true');
      -- 快照：status
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('todo', v_dup.id, 'status', 'active', 'completed');

      -- 转移 wiki_page_id：如果被合并的有 wiki_page_id 且主记录没有
      IF v_dup.wiki_page_id IS NOT NULL AND v_primary_wiki.wiki_page_id IS NULL THEN
        INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
        VALUES ('todo', v_primary_wiki.id, 'wiki_page_id', NULL, v_dup.wiki_page_id::TEXT);

        UPDATE todo SET wiki_page_id = v_dup.wiki_page_id
        WHERE id = v_primary_wiki.id;

        -- 更新内存中的主记录 wiki_page_id
        v_primary_wiki.wiki_page_id := v_dup.wiki_page_id;
      END IF;

      -- 重挂子 todo
      UPDATE todo SET parent_id = v_primary_wiki.id
      WHERE parent_id = v_dup.id;

      -- 标记为已合并
      UPDATE todo SET done = true, status = 'completed'
      WHERE id = v_dup.id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Step 1: 合并了 % 组共 % 条重复 goal todo', v_merge_count, v_total_dups;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 2: 重复 goal page 合并（场景 1.2）
-- ═══════════════════════════════════════════════════════
DO $$
DECLARE
  v_group RECORD;
  v_primary_id UUID;
  v_dup RECORD;
  v_merge_count INT := 0;
BEGIN
  FOR v_group IN
    SELECT user_id, LOWER(TRIM(title)) AS norm_title, COUNT(*) AS cnt
    FROM wiki_page
    WHERE page_type = 'goal' AND status = 'active'
    GROUP BY user_id, LOWER(TRIM(title))
    HAVING COUNT(*) > 1
  LOOP
    v_merge_count := v_merge_count + 1;

    -- 主记录：最早创建的
    SELECT id INTO v_primary_id
    FROM wiki_page
    WHERE user_id = v_group.user_id
      AND LOWER(TRIM(title)) = v_group.norm_title
      AND page_type = 'goal' AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    -- 处理重复 page
    FOR v_dup IN
      SELECT id
      FROM wiki_page
      WHERE user_id = v_group.user_id
        AND LOWER(TRIM(title)) = v_group.norm_title
        AND page_type = 'goal' AND status = 'active'
        AND id != v_primary_id
      ORDER BY created_at ASC
    LOOP
      -- 转移 wiki_page_record（ON CONFLICT DO NOTHING）
      INSERT INTO wiki_page_record (wiki_page_id, record_id)
      SELECT v_primary_id, record_id
      FROM wiki_page_record
      WHERE wiki_page_id = v_dup.id
      ON CONFLICT DO NOTHING;

      -- 删除被合并 page 的 record 关联（已转移）
      DELETE FROM wiki_page_record WHERE wiki_page_id = v_dup.id;

      -- 快照：status
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_dup.id, 'status', 'active', 'merged');
      -- 快照：merged_into
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_dup.id, 'merged_into', NULL, v_primary_id::TEXT);

      -- 标记被合并 page
      UPDATE wiki_page SET status = 'merged', merged_into = v_primary_id
      WHERE id = v_dup.id;

      -- 更新引用被合并 page 的 todo.wiki_page_id
      UPDATE todo SET wiki_page_id = v_primary_id
      WHERE wiki_page_id = v_dup.id;

      -- 快照 todo 引用变更（批量）
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      SELECT 'todo', id, 'wiki_page_id', v_dup.id::TEXT, v_primary_id::TEXT
      FROM todo
      WHERE wiki_page_id = v_primary_id
        AND id IN (
          SELECT row_id FROM _goal_cleanup_snapshot
          WHERE table_name = 'todo' AND column_name = 'wiki_page_id'
            AND new_value = v_primary_id::TEXT AND old_value = v_dup.id::TEXT
        );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Step 2: 合并了 % 组重复 goal page', v_merge_count;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 3: 孤儿 goal todo 修复（场景 2.1）
-- ═══════════════════════════════════════════════════════
-- 有 todo 无 page → 按文本匹配已有 page 或创建新 page
DO $$
DECLARE
  v_todo RECORD;
  v_matched_page_id UUID;
  v_new_page_id UUID;
  v_fix_count INT := 0;
  v_create_count INT := 0;
BEGIN
  FOR v_todo IN
    SELECT id, user_id, text
    FROM todo
    WHERE level >= 1
      AND wiki_page_id IS NULL
      AND done = false
  LOOP
    -- 尝试匹配已有 goal page
    SELECT id INTO v_matched_page_id
    FROM wiki_page
    WHERE user_id = v_todo.user_id
      AND page_type = 'goal'
      AND status = 'active'
      AND LOWER(TRIM(title)) = LOWER(TRIM(v_todo.text))
    LIMIT 1;

    IF v_matched_page_id IS NOT NULL THEN
      -- 快照
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('todo', v_todo.id, 'wiki_page_id', NULL, v_matched_page_id::TEXT);

      UPDATE todo SET wiki_page_id = v_matched_page_id
      WHERE id = v_todo.id;

      v_fix_count := v_fix_count + 1;
    ELSE
      -- 创建新 wiki_page
      INSERT INTO wiki_page (user_id, title, level, page_type, status, created_by, content)
      VALUES (v_todo.user_id, v_todo.text, 3, 'goal', 'active', 'migration', '')
      RETURNING id INTO v_new_page_id;

      -- 快照
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('todo', v_todo.id, 'wiki_page_id', NULL, v_new_page_id::TEXT);

      UPDATE todo SET wiki_page_id = v_new_page_id
      WHERE id = v_todo.id;

      v_create_count := v_create_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Step 3: 关联已有 page % 条，创建新 page % 条', v_fix_count, v_create_count;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 4: 孤儿 goal page 修复（场景 2.2）
-- ═══════════════════════════════════════════════════════
-- 有 page 无 todo → 检查 record 关联数决定降级或归档
DO $$
DECLARE
  v_page RECORD;
  v_record_count INT;
  v_topic_count INT := 0;
  v_archive_count INT := 0;
BEGIN
  FOR v_page IN
    SELECT wp.id
    FROM wiki_page wp
    WHERE wp.page_type = 'goal'
      AND wp.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM todo t
        WHERE t.wiki_page_id = wp.id
          AND t.level >= 1
          AND t.done = false
      )
  LOOP
    SELECT COUNT(*) INTO v_record_count
    FROM wiki_page_record
    WHERE wiki_page_id = v_page.id;

    IF v_record_count > 0 THEN
      -- 有 record → 降级为 topic
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_page.id, 'page_type', 'goal', 'topic');

      UPDATE wiki_page SET page_type = 'topic'
      WHERE id = v_page.id;

      v_topic_count := v_topic_count + 1;
    ELSE
      -- 无 record → 归档
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_page.id, 'status', 'active', 'archived');

      UPDATE wiki_page SET status = 'archived'
      WHERE id = v_page.id;

      v_archive_count := v_archive_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Step 4: 降级为 topic % 条，归档 % 条', v_topic_count, v_archive_count;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 5: 空壳 topic page 归档（场景 3.1）
-- ═══════════════════════════════════════════════════════
-- status='active', page_type='topic', 无 record, 无子页面, 创建超 7 天
INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
SELECT 'wiki_page', wp.id, 'status', 'active', 'archived'
FROM wiki_page wp
WHERE wp.status = 'active'
  AND wp.page_type = 'topic'
  AND wp.created_at < now() - interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page_record wpr WHERE wpr.wiki_page_id = wp.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page child WHERE child.parent_id = wp.id AND child.status = 'active'
  );

UPDATE wiki_page SET status = 'archived'
WHERE status = 'active'
  AND page_type = 'topic'
  AND created_at < now() - interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page_record wpr WHERE wpr.wiki_page_id = wiki_page.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page child WHERE child.parent_id = wiki_page.id AND child.status = 'active'
  );

-- ═══════════════════════════════════════════════════════
-- Step 6: 过期 suggested 目标清理（场景 5.1）
-- ═══════════════════════════════════════════════════════
DO $$
DECLARE
  v_todo RECORD;
  v_dismiss_count INT := 0;
BEGIN
  FOR v_todo IN
    SELECT id, wiki_page_id
    FROM todo
    WHERE level >= 1
      AND status = 'suggested'
      AND done = false
      AND created_at < now() - interval '14 days'
  LOOP
    -- 快照
    INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
    VALUES ('todo', v_todo.id, 'done', 'false', 'true');
    INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
    VALUES ('todo', v_todo.id, 'status', 'suggested', 'dismissed');

    UPDATE todo SET done = true, status = 'dismissed'
    WHERE id = v_todo.id;

    -- 关联 goal page → 归档
    IF v_todo.wiki_page_id IS NOT NULL THEN
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      SELECT 'wiki_page', id, 'status', status, 'archived'
      FROM wiki_page
      WHERE id = v_todo.wiki_page_id AND status = 'active';

      UPDATE wiki_page SET status = 'archived'
      WHERE id = v_todo.wiki_page_id AND status = 'active';
    END IF;

    v_dismiss_count := v_dismiss_count + 1;
  END LOOP;

  RAISE NOTICE 'Step 6: 清理了 % 条过期 suggested 目标', v_dismiss_count;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 7: Goal page 重挂载到 topic 下（场景 4.1 + 4.2）
-- ═══════════════════════════════════════════════════════
DO $$
DECLARE
  v_embedding_pct NUMERIC;
  v_use_embedding BOOLEAN;
  v_page RECORD;
  v_best_topic_id UUID;
  v_best_topic_level INT;
  v_best_score NUMERIC;
  v_mount_count INT := 0;
BEGIN
  -- 检查 embedding 覆盖率
  SELECT
    COALESCE(
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0),
      0
    )
  INTO v_embedding_pct
  FROM wiki_page
  WHERE status = 'active';

  v_use_embedding := v_embedding_pct >= 30;

  IF NOT v_use_embedding THEN
    -- 确保 pg_trgm 扩展可用
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;

  RAISE NOTICE 'Step 7: embedding 覆盖率 %%, 使用 %',
    v_embedding_pct,
    CASE WHEN v_use_embedding THEN 'embedding' ELSE 'pg_trgm' END;

  -- 遍历无父级的 active goal page
  FOR v_page IN
    SELECT id, user_id, title, embedding, level
    FROM wiki_page
    WHERE page_type = 'goal'
      AND parent_id IS NULL
      AND status = 'active'
  LOOP
    v_best_topic_id := NULL;
    v_best_score := 0;

    IF v_use_embedding AND v_page.embedding IS NOT NULL THEN
      -- 使用 embedding 余弦相似度
      SELECT id, level, 1 - (v_page.embedding <=> tp.embedding) AS score
      INTO v_best_topic_id, v_best_topic_level, v_best_score
      FROM wiki_page tp
      WHERE tp.user_id = v_page.user_id
        AND tp.page_type = 'topic'
        AND tp.status = 'active'
        AND tp.embedding IS NOT NULL
        AND tp.id != v_page.id
      ORDER BY v_page.embedding <=> tp.embedding ASC
      LIMIT 1;

      -- 阈值检查
      IF v_best_score <= 0.5 THEN
        v_best_topic_id := NULL;
      END IF;
    ELSE
      -- 使用 pg_trgm 文本相似度
      SELECT id, level, similarity(v_page.title, tp.title) AS score
      INTO v_best_topic_id, v_best_topic_level, v_best_score
      FROM wiki_page tp
      WHERE tp.user_id = v_page.user_id
        AND tp.page_type = 'topic'
        AND tp.status = 'active'
        AND tp.id != v_page.id
        AND similarity(v_page.title, tp.title) > 0.3
      ORDER BY similarity(v_page.title, tp.title) DESC
      LIMIT 1;
    END IF;

    IF v_best_topic_id IS NOT NULL THEN
      -- 快照
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_page.id, 'parent_id', NULL, v_best_topic_id::TEXT);
      INSERT INTO _goal_cleanup_snapshot (table_name, row_id, column_name, old_value, new_value)
      VALUES ('wiki_page', v_page.id, 'level',
              v_page.level::TEXT,
              GREATEST(1, v_best_topic_level - 1)::TEXT);

      UPDATE wiki_page
      SET parent_id = v_best_topic_id,
          level = GREATEST(1, v_best_topic_level - 1)
      WHERE id = v_page.id;

      v_mount_count := v_mount_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Step 7: 挂载了 % 个 goal page 到 topic 下', v_mount_count;
END $$;

-- ═══════════════════════════════════════════════════════
-- 验证查询（仅输出统计，不修改数据）
-- ═══════════════════════════════════════════════════════
DO $$
DECLARE
  v_snap_count INT;
  v_active_goals INT;
  v_orphan_todos INT;
  v_orphan_pages INT;
  v_mounted INT;
BEGIN
  SELECT COUNT(*) INTO v_snap_count FROM _goal_cleanup_snapshot;
  SELECT COUNT(*) INTO v_active_goals FROM todo WHERE level >= 1 AND done = false;
  SELECT COUNT(*) INTO v_orphan_todos FROM todo WHERE level >= 1 AND wiki_page_id IS NULL AND done = false;
  SELECT COUNT(*) INTO v_orphan_pages FROM wiki_page wp
    WHERE wp.page_type = 'goal' AND wp.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM todo t WHERE t.wiki_page_id = wp.id AND t.level >= 1);
  SELECT COUNT(*) INTO v_mounted FROM wiki_page
    WHERE page_type = 'goal' AND status = 'active' AND parent_id IS NOT NULL;

  RAISE NOTICE '=== 迁移统计 ===';
  RAISE NOTICE '快照记录数: %', v_snap_count;
  RAISE NOTICE '活跃目标数: %', v_active_goals;
  RAISE NOTICE '孤儿 todo（无 page）: %', v_orphan_todos;
  RAISE NOTICE '孤儿 page（无 todo）: %', v_orphan_pages;
  RAISE NOTICE '已挂载 goal page: %', v_mounted;
END $$;
