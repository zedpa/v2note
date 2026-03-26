-- Agent Plan 机制
CREATE TABLE IF NOT EXISTS agent_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  device_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'drafting'
    CHECK (status IN ('drafting','awaiting_confirm','executing','paused',
                      'done','partial_failure','expired','abandoned')),
  current_step INT NOT NULL DEFAULT 0,
  rollback_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_user_status ON agent_plan(user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_plan_device_status ON agent_plan(device_id, status);
