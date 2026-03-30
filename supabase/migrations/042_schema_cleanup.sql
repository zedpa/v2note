-- 042: Schema 清理 + Embedding 持久化基础设施
-- 数据库已清空，无需数据迁移。全部幂等（IF EXISTS / IF NOT EXISTS）。

-- 确保 pgvector 扩展可用
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- CRITICAL 1: strike 表添加 embedding 向量列
-- 用于 goal-auto-link / knowledge-lifecycle / todo-projector 的语义匹配
-- ============================================================
ALTER TABLE strike ADD COLUMN IF NOT EXISTS embedding vector(1024);
CREATE INDEX IF NOT EXISTS idx_strike_embedding ON strike
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- CRITICAL 2: todo_embedding / goal_embedding 表
-- 用于 todo 去重和目标关联的语义匹配
-- ============================================================
CREATE TABLE IF NOT EXISTS todo_embedding (
  todo_id UUID PRIMARY KEY REFERENCES todo(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_todo_embedding ON todo_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS goal_embedding (
  goal_id UUID PRIMARY KEY REFERENCES todo(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goal_embedding ON goal_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE todo_embedding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_todo_embedding_all" ON todo_embedding;
CREATE POLICY "anon_todo_embedding_all" ON todo_embedding
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE goal_embedding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_goal_embedding_all" ON goal_embedding;
CREATE POLICY "anon_goal_embedding_all" ON goal_embedding
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- CRITICAL 3: device_id TEXT → UUID 类型修正
-- pending_intent 和 agent_plan 的 device_id 定义为 TEXT，应为 UUID
-- ============================================================
ALTER TABLE pending_intent ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
ALTER TABLE agent_plan ALTER COLUMN device_id TYPE UUID USING device_id::uuid;

-- ============================================================
-- HIGH 4: goal 表替换为 VIEW
-- goalRepo 已是 todo 适配层，所有代码只 SELECT goal，无 INSERT/UPDATE/DELETE
-- ============================================================

-- 先删除 todo.goal_id 指向 goal 表的 FK
ALTER TABLE todo DROP CONSTRAINT IF EXISTS todo_goal_id_fkey;

-- 删除 goal 表的相关索引（migration 014 添加的）
DROP INDEX IF EXISTS idx_goal_user_id;
DROP INDEX IF EXISTS idx_goal_device;
DROP INDEX IF EXISTS idx_goal_active;

-- DROP goal 表（CASCADE 会连带 pending_intent.promoted_to 等无约束引用不受影响）
DROP TABLE IF EXISTS goal CASCADE;

-- 重建 todo.goal_id FK 指向 todo(id)
ALTER TABLE todo ADD CONSTRAINT todo_goal_id_fkey
  FOREIGN KEY (goal_id) REFERENCES todo(id) ON DELETE SET NULL;

-- 创建向后兼容 VIEW
CREATE OR REPLACE VIEW goal AS
  SELECT id, device_id, user_id, text AS title, parent_id,
         status, COALESCE(category, 'speech') AS source,
         cluster_id, created_at,
         COALESCE(updated_at, created_at) AS updated_at
  FROM todo
  WHERE level >= 1;

-- ============================================================
-- HIGH 5-6: DROP 废弃表
-- ============================================================
DROP TABLE IF EXISTS weekly_review CASCADE;
DROP TABLE IF EXISTS customer_request CASCADE;
DROP TABLE IF EXISTS setting_change CASCADE;

-- ============================================================
-- MEDIUM 7: 复合索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_strike_user_created
  ON strike(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todo_user_done_level
  ON todo(user_id, done, level);
CREATE INDEX IF NOT EXISTS idx_todo_device_done_level
  ON todo(device_id, done, level);

-- ============================================================
-- MEDIUM 8: domain CHECK 约束（统一中文）
-- ============================================================
ALTER TABLE todo ALTER COLUMN domain SET DEFAULT '工作';

ALTER TABLE todo DROP CONSTRAINT IF EXISTS chk_todo_domain;
ALTER TABLE todo ADD CONSTRAINT chk_todo_domain
  CHECK (domain IS NULL OR domain IN ('工作','学习','创业','家庭','健康','生活','社交'));

ALTER TABLE strike DROP CONSTRAINT IF EXISTS chk_strike_domain;
ALTER TABLE strike ADD CONSTRAINT chk_strike_domain
  CHECK (domain IS NULL OR domain IN ('工作','学习','创业','家庭','健康','生活','社交'));

ALTER TABLE record DROP CONSTRAINT IF EXISTS chk_record_domain;
ALTER TABLE record ADD CONSTRAINT chk_record_domain
  CHECK (domain IS NULL OR domain IN ('工作','学习','创业','家庭','健康','生活','社交'));
