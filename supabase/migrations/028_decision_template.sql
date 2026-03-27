-- 决策模板

CREATE TABLE decision_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal_id UUID REFERENCES goal(id) ON DELETE SET NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  outcome TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_decision_template_user ON decision_template(user_id);
