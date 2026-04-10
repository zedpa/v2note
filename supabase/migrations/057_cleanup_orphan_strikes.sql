-- 清理历史遗留的孤儿 Strike
-- 删除 source_id IS NULL 且非聚类的 Strike（record 被删后残留的幽灵数据）
-- 聚类 Strike（is_cluster=true）的 source_id 本来就是 NULL，不受影响
DELETE FROM strike WHERE source_id IS NULL AND is_cluster = false;
