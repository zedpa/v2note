-- 扩展 record.source 约束，支持 chat_tool（AI 聊天中创建的日记）
ALTER TABLE record DROP CONSTRAINT IF EXISTS record_source_check;
ALTER TABLE record ADD CONSTRAINT record_source_check
  CHECK (source IN ('voice', 'manual', 'todo_voice', 'command_voice', 'chat_tool'));
