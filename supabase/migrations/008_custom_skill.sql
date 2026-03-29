-- Custom skills: user-created or AI-created skills
CREATE TABLE IF NOT EXISTS custom_skill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES device(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'review' CHECK (type IN ('review', 'process')),
  enabled BOOLEAN DEFAULT true,
  created_by TEXT DEFAULT 'user' CHECK (created_by IN ('user', 'ai')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, name)
);
