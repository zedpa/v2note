-- ============================================================
-- 066: record.device_id 改为可空
--
-- 身份体系从 device_id 迁移到 user_id 后，
-- 录音创建不再传递 device_id，但原 schema 有 NOT NULL 约束，
-- 导致 INSERT 失败、asr.done 无法发出、前端 15 秒超时。
-- ============================================================

ALTER TABLE record ALTER COLUMN device_id DROP NOT NULL;
