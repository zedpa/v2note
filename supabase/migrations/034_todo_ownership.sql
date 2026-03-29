-- 给 todo 表添加直接归属字段，支持不关联 record 的独立 todo
ALTER TABLE todo ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES device(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_todo_user ON todo(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_device ON todo(device_id);

-- 回填已有 todo 的归属（从关联 record 继承）
UPDATE todo t SET
  user_id = r.user_id,
  device_id = r.device_id
FROM record r
WHERE t.record_id = r.id AND t.user_id IS NULL;
