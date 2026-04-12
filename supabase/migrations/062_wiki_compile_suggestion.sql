-- Phase 14.7: wiki_compile_suggestion 表 — AI 结构修改建议
-- AI 对用户创建的 page 进行结构性操作（拆分/合并/重命名/删除）时，
-- 不直接执行，而是创建建议记录等待用户确认。

CREATE TABLE IF NOT EXISTS wiki_compile_suggestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('split', 'merge', 'rename', 'archive')),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestion_user ON wiki_compile_suggestion(user_id, status);
