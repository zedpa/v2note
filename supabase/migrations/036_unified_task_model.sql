-- 036: 统一任务模型 — Goal 消解为 todo.level>=1
-- 背景：goal 和 todo 分表导致关联断裂，统一到 todo 表

-- 1. todo 表加新字段
ALTER TABLE todo ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES strike(id) ON DELETE SET NULL;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. record 表加 domain（全局筛选需要）
ALTER TABLE record ADD COLUMN IF NOT EXISTS domain TEXT;

-- 3. strike 表加 domain（只给 is_cluster=true 的填值）
ALTER TABLE strike ADD COLUMN IF NOT EXISTS domain TEXT;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_todo_level ON todo(level);
CREATE INDEX IF NOT EXISTS idx_todo_domain ON todo(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todo_cluster ON todo(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todo_status ON todo(status) WHERE status != 'active';
CREATE INDEX IF NOT EXISTS idx_record_domain ON record(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_strike_domain ON strike(domain) WHERE is_cluster = true AND domain IS NOT NULL;

-- 5. 现有 done=true 的 todo 同步 status
UPDATE todo SET status = 'completed' WHERE done = true AND status = 'active';
