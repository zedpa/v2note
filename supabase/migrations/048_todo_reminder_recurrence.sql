-- 048: 待办提醒 + 周期任务 + 日历同步
-- Spec: specs/voice-routing-v2.md Part F

-- ── 提醒字段 ──────────────────────────────────────────────────
ALTER TABLE todo ADD COLUMN IF NOT EXISTS reminder_at       TIMESTAMPTZ;  -- 绝对提醒时间（后端调度用）
ALTER TABLE todo ADD COLUMN IF NOT EXISTS reminder_before   INT;          -- 提前分钟数（用户意图，用于重算 reminder_at）
ALTER TABLE todo ADD COLUMN IF NOT EXISTS reminder_types    TEXT[];       -- {'notification','alarm','calendar'} 可多选

-- ── 周期字段 ──────────────────────────────────────────────────
ALTER TABLE todo ADD COLUMN IF NOT EXISTS recurrence_rule      TEXT;      -- 'daily'|'weekdays'|'weekly:1,3,5'|'monthly:15'
ALTER TABLE todo ADD COLUMN IF NOT EXISTS recurrence_end       DATE;      -- 周期结束日期（NULL = 永不结束）
ALTER TABLE todo ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES todo(id) ON DELETE SET NULL;

-- ── 日历同步字段（预埋，v2 实现）─────────────────────────────
ALTER TABLE todo ADD COLUMN IF NOT EXISTS calendar_event_id  TEXT;        -- 外部日历事件 ID
ALTER TABLE todo ADD COLUMN IF NOT EXISTS calendar_synced_at TIMESTAMPTZ; -- 最近同步时间

-- ── 提醒已发送标记（避免重复推送）────────────────────────────
ALTER TABLE todo ADD COLUMN IF NOT EXISTS reminder_sent      BOOLEAN DEFAULT false;

-- ── 索引 ──────────────────────────────────────────────────────
-- 提醒调度查询：未完成 + 有提醒时间 + 未发送
CREATE INDEX IF NOT EXISTS idx_todo_reminder_pending
  ON todo(reminder_at)
  WHERE reminder_at IS NOT NULL AND done = false AND reminder_sent = false;

-- 周期模板查询：有规则 + 非实例（parent_id IS NULL）
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_template
  ON todo(recurrence_rule)
  WHERE recurrence_rule IS NOT NULL AND recurrence_parent_id IS NULL;

-- 周期实例查询：按模板 ID
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_parent
  ON todo(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
