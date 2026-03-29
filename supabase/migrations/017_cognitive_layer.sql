-- Cognitive layer: strike, bond, strike_tag, cluster_member tables

-- strike table
CREATE TABLE IF NOT EXISTS strike (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  nucleus TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK (polarity IN ('perceive', 'judge', 'realize', 'intend', 'feel')),
  field JSONB DEFAULT '{}',
  source_id UUID REFERENCES record(id),
  source_span TEXT,
  source_type TEXT DEFAULT 'voice',
  confidence REAL DEFAULT 0.5,
  salience REAL DEFAULT 1.0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by UUID REFERENCES strike(id),
  is_cluster BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  digested_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_strike_user ON strike(user_id);
CREATE INDEX IF NOT EXISTS idx_strike_polarity ON strike(user_id, polarity);
CREATE INDEX IF NOT EXISTS idx_strike_status ON strike(user_id, status);
CREATE INDEX IF NOT EXISTS idx_strike_source ON strike(source_id);

-- bond table
CREATE TABLE IF NOT EXISTS bond (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  target_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  created_by TEXT DEFAULT 'digest',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bond_source ON bond(source_strike_id);
CREATE INDEX IF NOT EXISTS idx_bond_target ON bond(target_strike_id);
CREATE INDEX IF NOT EXISTS idx_bond_type ON bond(type);

-- strike_tag table
CREATE TABLE IF NOT EXISTS strike_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  created_by TEXT DEFAULT 'digest',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strike_tag_strike ON strike_tag(strike_id);
CREATE INDEX IF NOT EXISTS idx_strike_tag_label ON strike_tag(label);

-- cluster_member table
CREATE TABLE IF NOT EXISTS cluster_member (
  cluster_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  member_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_strike_id, member_strike_id)
);

-- Extend record table for digest tracking
ALTER TABLE record ADD COLUMN IF NOT EXISTS digested BOOLEAN DEFAULT FALSE;
ALTER TABLE record ADD COLUMN IF NOT EXISTS digested_at TIMESTAMPTZ;

-- RLS policies
ALTER TABLE strike ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_strike_all" ON strike;
CREATE POLICY "anon_strike_all" ON strike FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE bond ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_bond_all" ON bond;
CREATE POLICY "anon_bond_all" ON bond FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE strike_tag ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_strike_tag_all" ON strike_tag;
CREATE POLICY "anon_strike_tag_all" ON strike_tag FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE cluster_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_cluster_member_all" ON cluster_member;
CREATE POLICY "anon_cluster_member_all" ON cluster_member FOR ALL TO anon USING (true) WITH CHECK (true);
