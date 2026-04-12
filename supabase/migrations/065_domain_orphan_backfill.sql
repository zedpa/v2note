-- ============================================================
-- 065: Domain 孤儿记录补链到 Wiki Page
--
-- 将 record.domain 非空但无 wiki_page_record 关联的记录，
-- 按 domain 一级前缀匹配 wiki_page，补建 wiki_page_record 关联。
-- 匹配优先级：
--   1. wp.domain 精确匹配 domain 前缀（classifier 创建 page 时设的 domain 字段）
--   2. wp.title 精确匹配 domain 前缀
--   3. wp.title 包含 domain 前缀（如 domain="工作" 匹配 title="工作事务"）
-- 匹配不到的 domain 自动创建新 L3 wiki_page。
-- ============================================================

-- Step 1: 关联孤儿记录到已有的 best-match wiki_page
-- DISTINCT ON (r.id) 确保每条记录只链接到一个 page（优先级最高的那个）
INSERT INTO wiki_page_record (wiki_page_id, record_id)
SELECT DISTINCT ON (r.id) wp.id, r.id
FROM record r
JOIN wiki_page wp ON wp.user_id = r.user_id AND wp.status = 'active'
WHERE r.domain IS NOT NULL
  AND r.status = 'completed'
  AND r.archived = false
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
  )
  AND (
    wp.domain = SPLIT_PART(r.domain, '/', 1)                          -- 优先级 1: domain 精确匹配
    OR wp.title = SPLIT_PART(r.domain, '/', 1)                        -- 优先级 2: title 精确匹配
    OR wp.title LIKE SPLIT_PART(r.domain, '/', 1) || '%'              -- 优先级 3: title 前缀匹配
  )
ORDER BY r.id,
  CASE
    WHEN wp.domain = SPLIT_PART(r.domain, '/', 1) THEN 1
    WHEN wp.title = SPLIT_PART(r.domain, '/', 1) THEN 2
    WHEN wp.title LIKE SPLIT_PART(r.domain, '/', 1) || '%' THEN 3
  END,
  wp.level DESC  -- 同优先级时偏好 L3 顶层 page
ON CONFLICT (wiki_page_id, record_id) DO NOTHING;

-- Step 2: 为仍未匹配的孤儿 domain 前缀创建新 L3 page
INSERT INTO wiki_page (user_id, title, level, domain, page_type, created_by, content)
SELECT DISTINCT
  r.user_id,
  SPLIT_PART(r.domain, '/', 1) AS title,
  3 AS level,
  SPLIT_PART(r.domain, '/', 1) AS domain,
  'topic' AS page_type,
  'ai' AS created_by,
  '' AS content
FROM record r
WHERE r.domain IS NOT NULL
  AND r.status = 'completed'
  AND r.archived = false
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
  )
ON CONFLICT DO NOTHING;

-- Step 3: 关联 Step 2 新创建的 page 到剩余孤儿记录
INSERT INTO wiki_page_record (wiki_page_id, record_id)
SELECT wp.id, r.id
FROM record r
JOIN wiki_page wp ON wp.user_id = r.user_id
  AND wp.domain = SPLIT_PART(r.domain, '/', 1)
  AND wp.status = 'active'
WHERE r.domain IS NOT NULL
  AND r.status = 'completed'
  AND r.archived = false
  AND NOT EXISTS (
    SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
  )
ON CONFLICT (wiki_page_id, record_id) DO NOTHING;
