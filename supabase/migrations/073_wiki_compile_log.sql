-- 073: 编译变更摘要日志（Batch 2 Phase 8）
CREATE TABLE IF NOT EXISTS wiki_compile_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  pages_created INT NOT NULL DEFAULT 0,
  pages_updated INT NOT NULL DEFAULT 0,
  records_compiled INT NOT NULL DEFAULT 0,
  change_summary TEXT,           -- AI 生成的变更摘要（供早报引用）
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcl_user_date ON wiki_compile_log(user_id, created_at DESC);
