-- Wiki Page 所有权追踪：区分用户创建 vs AI 创建
-- 'user': 用户手动创建/改名，AI 不可修改标题和层级
-- 'ai': AI 编译创建，AI 可修改，用户改名后变为 'user'
ALTER TABLE wiki_page ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'ai';
