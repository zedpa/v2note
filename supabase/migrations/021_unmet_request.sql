-- 未满足请求记录
CREATE TABLE IF NOT EXISTS unmet_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  request_text TEXT NOT NULL,
  failure_reason TEXT,
  session_mode TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unmet_request_user ON unmet_request(user_id);
