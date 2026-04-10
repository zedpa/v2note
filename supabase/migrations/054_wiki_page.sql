-- 054: Wiki Page 数据模型（Batch 1 Phase 1）
-- wiki_page 表 + wiki_page_record 关联表 + goal/record 表扩展

-- ── wiki_page 表 ──
CREATE TABLE wiki_page (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT,
  parent_id UUID REFERENCES wiki_page(id),
  level INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','merged')),
  merged_into UUID REFERENCES wiki_page(id),
  domain TEXT,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  compiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wiki_page_user ON wiki_page(user_id) WHERE status = 'active';
CREATE INDEX idx_wiki_page_parent ON wiki_page(parent_id);

-- ── wiki_page_record 关联表 ──
CREATE TABLE wiki_page_record (
  wiki_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wiki_page_id, record_id)
);
CREATE INDEX idx_wpr_record ON wiki_page_record(record_id);

-- ── goal 表新增 wiki_page_id ──
ALTER TABLE todo ADD COLUMN wiki_page_id UUID REFERENCES wiki_page(id);

-- ── record 表新增 compile_status + content_hash ──
ALTER TABLE record ADD COLUMN compile_status TEXT DEFAULT 'pending'
  CHECK (compile_status IN ('pending', 'compiled', 'skipped', 'needs_recompile'));
ALTER TABLE record ADD COLUMN content_hash TEXT;
CREATE INDEX idx_record_compile_pending ON record(user_id)
  WHERE compile_status IN ('pending', 'needs_recompile');

-- ── 历史数据：跳过已处理的 record，只编译迁移后的新数据 ──
UPDATE record SET compile_status = 'skipped'
  WHERE compile_status = 'pending' AND created_at < now();
