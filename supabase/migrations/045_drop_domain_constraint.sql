-- domain 字段已废弃，侧边栏改为聚类驱动结构（见 specs/sidebar-my-world.md）
-- 删除 CHECK 约束，允许 AI 返回任意值或 null
ALTER TABLE todo DROP CONSTRAINT IF EXISTS chk_todo_domain;
