-- 014: User authentication + multi-device data unification

-- 1. User accounts table
CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add user_id to device table
ALTER TABLE device ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_device_user_id ON device(user_id);

-- 3. Refresh tokens for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id UUID REFERENCES device(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_token(token_hash);

-- 4. Add user_id to all user-level tables
ALTER TABLE record ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_record_user_id ON record(user_id);

ALTER TABLE memory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_memory_user_id ON memory(user_id);

ALTER TABLE soul ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_soul_user_id ON soul(user_id);

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_user_profile_user_id ON user_profile(user_id);

ALTER TABLE goal ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_goal_user_id ON goal(user_id);

ALTER TABLE pending_intent ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_pending_intent_user_id ON pending_intent(user_id);

ALTER TABLE notebook ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_notebook_user_id ON notebook(user_id);

ALTER TABLE ai_diary ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_ai_diary_user_id ON ai_diary(user_id);

ALTER TABLE weekly_review ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_weekly_review_user_id ON weekly_review(user_id);

ALTER TABLE skill_config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_skill_config_user_id ON skill_config(user_id);

-- 5. Unique partial indexes for user-level singleton tables (soul, user_profile)
CREATE UNIQUE INDEX IF NOT EXISTS idx_soul_user_id_unique ON soul(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user_id_unique ON user_profile(user_id) WHERE user_id IS NOT NULL;
