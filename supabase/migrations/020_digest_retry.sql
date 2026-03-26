-- Digest 重试机制：添加尝试计数
ALTER TABLE record ADD COLUMN IF NOT EXISTS digest_attempts INTEGER DEFAULT 0;
