-- 热词表 ID 存在用户维度（跨设备共享），而非设备维度
-- 同一用户的所有设备共用一份 DashScope 热词表
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS asr_vocabulary_id TEXT;
