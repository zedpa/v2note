-- Phase 14.1: Wiki Page 统一模型 — 数据模型变更
-- 新增字段：page_type, token_count
-- 新增表：wiki_page_link
-- 扩展 record.source_type：新增 'ai_diary'
-- record.metadata 已有 JSONB 类型，target_path / classified_path 在应用层写入，无需迁移

-- ── wiki_page 新增 page_type ──
ALTER TABLE wiki_page ADD COLUMN IF NOT EXISTS page_type TEXT NOT NULL DEFAULT 'topic'
  CHECK (page_type IN ('topic', 'goal'));

-- ── wiki_page 新增 token_count ──
ALTER TABLE wiki_page ADD COLUMN IF NOT EXISTS token_count INTEGER NOT NULL DEFAULT 0;

-- ── record.source_type 扩展：新增 ai_diary ──
-- 原约束在 018_source_type.sql 中创建（内联 CHECK），自动命名可能是 record_source_type_check 或 record_check
-- 安全做法：通过系统表查找并删除所有 record 表上 source_type 列的 CHECK 约束
DO $$
DECLARE
  _con TEXT;
BEGIN
  FOR _con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
    WHERE con.conrelid = 'record'::regclass
      AND con.contype = 'c'
      AND att.attname = 'source_type'
  LOOP
    EXECUTE format('ALTER TABLE record DROP CONSTRAINT %I', _con);
  END LOOP;
END $$;

ALTER TABLE record ADD CONSTRAINT record_source_type_check
  CHECK (source_type IN ('think', 'material', 'ai_diary'));

-- ── 新建 wiki_page_link 表（跨页链接）──
CREATE TABLE IF NOT EXISTS wiki_page_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  target_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('reference', 'related', 'contradicts')),
  context_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_page_id, target_page_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_link_source ON wiki_page_link(source_page_id);
CREATE INDEX IF NOT EXISTS idx_wiki_page_link_target ON wiki_page_link(target_page_id);
