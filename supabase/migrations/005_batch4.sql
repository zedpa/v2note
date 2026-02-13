-- Batch 4: 树状笔记 + 标签重构 + 复盘体系

-- 设备自定义标签
ALTER TABLE device ADD COLUMN custom_tags JSONB DEFAULT '[]';

-- 统一复盘表（替代 weekly_review）
CREATE TABLE review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id),
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT,
  stats JSONB,
  structured_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, period, period_start)
);
ALTER TABLE review ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_review" ON review FOR ALL USING (true);

-- 迁移 weekly_review 数据
INSERT INTO review (id, device_id, period, period_start, period_end, summary, stats, structured_data, created_at)
SELECT id, device_id, 'weekly', week_start, week_end, summary, stats, structured_data, created_at
FROM weekly_review;
