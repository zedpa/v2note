-- Record 层级标签：从涌现结构（L1/L2/L3）反向标注
-- 格式: [{"label":"职业发展","level":2}, {"label":"技能提升","level":1}, {"label":"工作","level":3}]
ALTER TABLE record ADD COLUMN IF NOT EXISTS hierarchy_tags JSONB DEFAULT '[]';
