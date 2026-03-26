-- Goal Lifecycle: 状态扩展 + 行动事件表

-- 扩展 goal status: 增加 progressing, blocked, suggested, dismissed
ALTER TABLE goal DROP CONSTRAINT IF EXISTS goal_status_check;
ALTER TABLE goal ADD CONSTRAINT goal_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'abandoned', 'progressing', 'blocked', 'suggested', 'dismissed'));

-- 行动事件表：记录 todo 的完成/跳过/恢复事件
CREATE TABLE action_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todo(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('complete', 'skip', 'resume')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_event_todo ON action_event(todo_id);
CREATE INDEX idx_action_event_type ON action_event(type, created_at);

-- todo 增加 skip_count 便于快速查询
ALTER TABLE todo ADD COLUMN skip_count INTEGER NOT NULL DEFAULT 0;
