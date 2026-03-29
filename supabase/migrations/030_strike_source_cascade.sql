-- 修复：删除 record 时 strike.source_id 外键阻止删除
-- 改为 ON DELETE SET NULL：record 删除后 strike 保留，source_id 置空

ALTER TABLE strike
  DROP CONSTRAINT IF EXISTS strike_source_id_fkey;

ALTER TABLE strike
  ADD CONSTRAINT strike_source_id_fkey
  FOREIGN KEY (source_id) REFERENCES record(id) ON DELETE SET NULL;
