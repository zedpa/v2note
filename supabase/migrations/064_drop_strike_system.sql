-- ============================================================
-- 064: 清理 Strike 系统相关表
--
-- Wiki 系统已完全替代 Strike/Cluster 管线。
-- 以下表不再被任何代码读写，安全删除。
-- ============================================================

-- 先删除依赖表（有外键引用 strike 的表先删）
DROP TABLE IF EXISTS cluster_member CASCADE;
DROP TABLE IF EXISTS person_strike CASCADE;
DROP TABLE IF EXISTS strike_tag CASCADE;
DROP TABLE IF EXISTS bond CASCADE;
DROP TABLE IF EXISTS cognitive_snapshot CASCADE;
DROP TABLE IF EXISTS person CASCADE;

-- 最后删除主表
DROP TABLE IF EXISTS strike CASCADE;

-- 清理 todo 表中的 strike_id 外键（列保留但解除约束）
ALTER TABLE todo DROP CONSTRAINT IF EXISTS todo_strike_id_fkey;
