-- 晨报/晚报改为用户维度：同一用户所有设备共享同一份报告
-- 已登录用户按 user_id 唯一；游客保留 device_id 唯一

ALTER TABLE daily_briefing ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);

-- 已登录用户的唯一约束（按 user 维度去重）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_briefing_user_date_type
  ON daily_briefing(user_id, briefing_date, briefing_type)
  WHERE user_id IS NOT NULL;
