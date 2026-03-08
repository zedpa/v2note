-- Daily Loop: Morning Briefing cache + Relay tracking extension

-- 1. Daily briefing cache table
CREATE TABLE IF NOT EXISTS daily_briefing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES device(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  briefing_type TEXT NOT NULL DEFAULT 'morning',  -- 'morning' | 'evening'
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, briefing_date, briefing_type)
);

CREATE INDEX idx_daily_briefing_device_date ON daily_briefing (device_id, briefing_date DESC);

-- 2. Extend todo table for relay tracking
ALTER TABLE todo ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'action';
-- 'action' = 普通待办, 'relay' = 转达任务, 'followup' = 跟进事项

ALTER TABLE todo ADD COLUMN IF NOT EXISTS relay_meta JSONB;
-- {"source_person":"张总", "target_person":"李经理", "context":"Q2预算调整", "direction":"outgoing"}

CREATE INDEX idx_todo_category ON todo (category) WHERE done = false;

-- 3. RLS policies for daily_briefing
ALTER TABLE daily_briefing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_briefing_device_access" ON daily_briefing
  FOR ALL USING (true);
