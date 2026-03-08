-- Todo Enrichment: domain, impact, AI actionability
ALTER TABLE todo ADD COLUMN IF NOT EXISTS domain TEXT DEFAULT 'work';
ALTER TABLE todo ADD COLUMN IF NOT EXISTS impact INTEGER DEFAULT 5;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS ai_actionable BOOLEAN DEFAULT false;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS ai_action_plan JSONB;

CREATE INDEX IF NOT EXISTS idx_todo_domain ON todo (domain) WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_todo_ai_actionable ON todo (ai_actionable) WHERE done = false;
