-- 允许 record.source = 'image'（图片上传来源标识）
ALTER TABLE record DROP CONSTRAINT IF EXISTS record_source_check;
ALTER TABLE record ADD CONSTRAINT record_source_check
  CHECK (source IN ('voice', 'manual', 'todo_voice', 'command_voice', 'chat_tool', 'image'));
