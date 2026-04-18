-- ============================================================
-- 068: client_id 幂等键 — record 与 chat_message
--
-- Spec: fix-cold-resume-silent-loss.md §6 Gateway 契约
--
-- 背景：
--   离线捕获 / 断网重连后，前端可能对同一条用户意图重复推送。
--   需要一个幂等键保证"同一 (user_id, client_id) 不重复创建"。
--
-- 设计：
--   - client_id TEXT（前端 localId，通常是 UUID）
--   - 仅对 NOT NULL 的行建 partial unique index，NULL 行不参与唯一性，
--     保证旧数据与非幂等链路（服务端直接创建）向后兼容
--   - 仅 ADD COLUMN + CREATE INDEX（IF NOT EXISTS），不涉及 DROP
-- ============================================================

-- record 表
ALTER TABLE record ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_user_client_id
  ON record (user_id, client_id)
  WHERE client_id IS NOT NULL;

-- chat_message 表
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_message_user_client_id
  ON chat_message (user_id, client_id)
  WHERE client_id IS NOT NULL;
