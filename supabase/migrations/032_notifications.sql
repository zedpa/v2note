-- 通知持久化表
CREATE TABLE IF NOT EXISTS notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id),
  user_id UUID REFERENCES app_user(id),
  type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_device ON notification(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification(device_id, read) WHERE read = false;
