-- 012: Memory Architecture Refactor
-- Separates user profile from AI soul, adds AI diary system

-- User profile (factual info about user, separated from AI soul/personality)
CREATE TABLE IF NOT EXISTS user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notebook registry (AI and user notebooks)
CREATE TABLE IF NOT EXISTS notebook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, name)
);

-- AI diary entries (one per notebook per day)
CREATE TABLE IF NOT EXISTS ai_diary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  notebook TEXT NOT NULL DEFAULT 'default',
  entry_date DATE NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  full_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, notebook, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_diary_device_date ON ai_diary(device_id, entry_date DESC);
