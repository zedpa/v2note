-- 涌现层级: L1(主题) L2(大主题) L3(领域/维度)
ALTER TABLE strike ADD COLUMN IF NOT EXISTS level INTEGER;
-- 预设标记: preset(冷启动预设) / emerged(涌现) / user(用户调整)
ALTER TABLE strike ADD COLUMN IF NOT EXISTS origin TEXT;
