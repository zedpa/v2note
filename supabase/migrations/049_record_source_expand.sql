-- 扩展 record.source 约束，支持 todo_voice 和 command_voice
ALTER TABLE record DROP CONSTRAINT IF EXISTS record_source_check;
ALTER TABLE record ADD CONSTRAINT record_source_check
  CHECK (source IN ('voice', 'manual', 'todo_voice', 'command_voice'));
