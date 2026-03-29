-- 人物画像系统

CREATE TABLE IF NOT EXISTS person (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  patterns JSONB DEFAULT '[]',
  stats JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_user ON person(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_user_name ON person(user_id, name);

-- person ↔ strike 关联表
CREATE TABLE IF NOT EXISTS person_strike (
  person_id UUID NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, strike_id)
);

CREATE INDEX IF NOT EXISTS idx_person_strike_person ON person_strike(person_id);
CREATE INDEX IF NOT EXISTS idx_person_strike_strike ON person_strike(strike_id);
