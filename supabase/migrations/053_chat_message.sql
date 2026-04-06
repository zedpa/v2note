-- 对话消息持久化表
-- spec: chat-persistence.md (场景 1.1)

CREATE TABLE IF NOT EXISTS chat_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES app_user(id),
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'context-summary')),
  content     TEXT NOT NULL,
  parts       JSONB,
  compressed  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户历史消息分页查询（按时间倒序）
CREATE INDEX idx_chat_msg_user_time ON chat_message (user_id, created_at DESC);

-- AI 上下文组装：快速查找未压缩消息
CREATE INDEX idx_chat_msg_uncompressed ON chat_message (user_id, created_at)
  WHERE role != 'context-summary' AND compressed = false;
