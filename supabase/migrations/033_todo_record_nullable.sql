-- 允许手动创建 Todo 时不关联 Record
-- smart-todo spec 要求支持独立 todo 创建
ALTER TABLE todo ALTER COLUMN record_id DROP NOT NULL;
