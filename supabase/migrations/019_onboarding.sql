-- 冷启动 5 问：扩展 user_profile 表
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS pain_points TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT false;
