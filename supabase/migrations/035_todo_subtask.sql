-- 子任务支持: todo 表增加 parent_id 字段
ALTER TABLE todo ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES todo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_todo_parent ON todo(parent_id);
