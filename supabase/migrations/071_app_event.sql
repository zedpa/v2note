-- 071: 应用事件埋点表（留存分析）
CREATE TABLE IF NOT EXISTS app_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_event_user ON app_event(user_id, event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_event_date ON app_event(created_at);
