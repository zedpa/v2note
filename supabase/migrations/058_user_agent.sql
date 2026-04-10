-- user_agent: 每用户个性化交互规则（规则/流程/技能配置/通知偏好）
CREATE TABLE IF NOT EXISTS user_agent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  template_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_agent_user_id ON user_agent(user_id);

-- RLS: 每个用户只能访问自己的 user_agent
ALTER TABLE user_agent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_agent_select_own" ON user_agent
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_agent_insert_own" ON user_agent
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_agent_update_own" ON user_agent
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_agent_delete_own" ON user_agent
  FOR DELETE USING (user_id = auth.uid());

-- Service role bypass（gateway 用 service key 访问）
CREATE POLICY "user_agent_service_all" ON user_agent
  FOR ALL USING (auth.role() = 'service_role');
