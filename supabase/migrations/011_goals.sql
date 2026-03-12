-- 目标树
CREATE TABLE goal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  parent_id UUID REFERENCES goal(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  source TEXT DEFAULT 'speech' CHECK (source IN ('speech','chat','manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_goal_device ON goal(device_id);
CREATE INDEX idx_goal_active ON goal(device_id, status) WHERE status = 'active';

-- 待确认意图（wish/goal 暂存区）
CREATE TABLE pending_intent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  record_id UUID REFERENCES record(id) ON DELETE CASCADE,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('wish','goal','complaint','reflection')),
  text TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed','promoted')),
  promoted_to UUID,  -- goal_id or todo_id
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pending_device ON pending_intent(device_id, status) WHERE status = 'pending';

-- todo 关联目标
ALTER TABLE todo ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goal(id) ON DELETE SET NULL;
