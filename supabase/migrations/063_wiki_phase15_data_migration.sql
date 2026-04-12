-- Phase 15.1: 现有 wiki page 数据迁移
-- 补充新字段值，保留现有 content 不重新编译

-- ── 1. page_type / created_by 已通过 061/059 迁移的 DEFAULT 覆盖 ──
-- 所有现有 page 已有 page_type='topic', created_by='ai'

-- ── 2. 有 goal 关联的 page 转为 goal 类型 ──
-- 查找 todo 表中 level >= 1 且有 wiki_page_id 的记录，对应的 page 改为 goal
UPDATE wiki_page
SET page_type = 'goal'
WHERE id IN (
  SELECT DISTINCT wiki_page_id
  FROM todo
  WHERE wiki_page_id IS NOT NULL
    AND level >= 1
)
AND status = 'active';

-- ── 3. L3 page 的 domain 与 title 对齐 ──
-- 确保 L3 page 的 domain 等于自己的 title
UPDATE wiki_page
SET domain = title
WHERE level = 3
  AND status = 'active'
  AND (domain IS NULL OR domain != title);

-- ── 4. L2/L1 page 继承父级 domain ──
-- 确保子页面的 domain 与其 L3 父页面一致
UPDATE wiki_page child
SET domain = parent.domain
FROM wiki_page parent
WHERE child.parent_id = parent.id
  AND child.level < 3
  AND child.status = 'active'
  AND parent.status = 'active'
  AND (child.domain IS NULL OR child.domain != parent.domain);

-- ── 5. 补充 token_count ──
-- 统计每个 page 关联的 compile_status='pending' 的 record 的估算 token 数
-- 估算公式：中文字符 ≈ 2 token/char
-- 使用 wiki_page_record 关联表 + transcript/summary 文本
WITH page_tokens AS (
  SELECT
    wpr.wiki_page_id,
    COALESCE(SUM(
      CASE
        WHEN s.short_summary IS NOT NULL THEN LENGTH(s.short_summary) * 2
        WHEN t.text IS NOT NULL THEN LENGTH(t.text) * 2
        ELSE 0
      END
    ), 0)::INTEGER AS estimated_tokens
  FROM wiki_page_record wpr
  JOIN record r ON r.id = wpr.record_id
  LEFT JOIN summary s ON s.record_id = r.id
  LEFT JOIN transcript t ON t.record_id = r.id
  WHERE r.compile_status = 'pending'
  GROUP BY wpr.wiki_page_id
)
UPDATE wiki_page wp
SET token_count = pt.estimated_tokens
FROM page_tokens pt
WHERE wp.id = pt.wiki_page_id
  AND wp.status = 'active'
  AND wp.token_count = 0;

-- ── 6. 记录迁移完成 ──
-- 添加注释以标记迁移已执行
COMMENT ON TABLE wiki_page IS 'Phase 15.1 data migration completed';
