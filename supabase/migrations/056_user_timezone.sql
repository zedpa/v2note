-- 用户时区字段：存储 IANA 时区标识（如 Asia/Shanghai）
-- 遵循国际通用做法：UTC 存储 + 用户时区字段，支持未来国际化
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Shanghai';

COMMENT ON COLUMN user_profile.timezone IS 'IANA timezone identifier (e.g. Asia/Shanghai, America/New_York)';
