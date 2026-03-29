-- Todo-Strike 数据桥梁
-- todo.strike_id 关联源 intend Strike
-- goal.cluster_id 指向对应 Cluster（is_cluster=true 的 Strike）

ALTER TABLE todo ADD COLUMN IF NOT EXISTS strike_id UUID REFERENCES strike(id) ON DELETE SET NULL;
ALTER TABLE goal ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES strike(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_todo_strike ON todo(strike_id) WHERE strike_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goal_cluster ON goal(cluster_id) WHERE cluster_id IS NOT NULL;
