-- Goal Granularity: source 扩展 + user_id/cluster_id 确保存在

-- 扩展 goal.source: 增加 explicit (用户明确表达), emerged (涌现产生)
ALTER TABLE goal DROP CONSTRAINT IF EXISTS goal_source_check;
ALTER TABLE goal ADD CONSTRAINT goal_source_check
  CHECK (source IN ('speech', 'chat', 'manual', 'explicit', 'emerged'));

-- 确保 user_id 列存在（用于跨设备查询）
ALTER TABLE goal ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 确保 cluster_id 列存在（goal → cluster 关联）
ALTER TABLE goal ADD COLUMN IF NOT EXISTS cluster_id UUID;

CREATE INDEX IF NOT EXISTS idx_goal_user ON goal(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_cluster ON goal(cluster_id);
