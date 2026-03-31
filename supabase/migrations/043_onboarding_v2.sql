-- 冷启动 5 问 v2：新增 profile 字段（不再创建日记，只存用户信息）
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS current_focus TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS review_time TEXT;
