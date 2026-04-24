-- 072: 知识热力系统（Batch 2 Phase 7）
-- wiki_page 新增 heat_score / heat_phase 字段
-- 新建 wiki_page_event 活动事件表

-- ── wiki_page 热力字段 ──
ALTER TABLE wiki_page ADD COLUMN IF NOT EXISTS heat_score REAL NOT NULL DEFAULT 0;
ALTER TABLE wiki_page ADD COLUMN IF NOT EXISTS heat_phase TEXT NOT NULL DEFAULT 'active'
  CHECK (heat_phase IN ('hot', 'active', 'silent', 'frozen'));

CREATE INDEX IF NOT EXISTS idx_wiki_page_heat ON wiki_page(user_id, heat_phase)
  WHERE status = 'active';

-- ── wiki_page_event 活动事件表（append-only，90天清理） ──
CREATE TABLE IF NOT EXISTS wiki_page_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_page_id UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('compile_hit', 'search_hit', 'view_hit', 'chat_context_hit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpe_page_date ON wiki_page_event(wiki_page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpe_cleanup ON wiki_page_event(created_at);

-- 初始化已有 page 的 heat_score（基于 compiled_at 距今天数衰减）
UPDATE wiki_page SET
  heat_score = CASE
    WHEN compiled_at IS NOT NULL THEN 3.0 * exp(-0.0495 * EXTRACT(DAY FROM now() - compiled_at))
    ELSE 0
  END,
  heat_phase = CASE
    WHEN compiled_at IS NOT NULL AND 3.0 * exp(-0.0495 * EXTRACT(DAY FROM now() - compiled_at)) > 8.0 THEN 'hot'
    WHEN compiled_at IS NOT NULL AND 3.0 * exp(-0.0495 * EXTRACT(DAY FROM now() - compiled_at)) >= 3.0 THEN 'active'
    WHEN compiled_at IS NOT NULL AND 3.0 * exp(-0.0495 * EXTRACT(DAY FROM now() - compiled_at)) >= 1.0 THEN 'silent'
    ELSE 'frozen'
  END
WHERE status = 'active';
