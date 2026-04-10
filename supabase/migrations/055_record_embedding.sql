-- 055: Record embedding 列（Wiki 编译路由 + 搜索需要）
-- Phase 2 的 writeRecordEmbedding 需要此列存储 record 级别向量

ALTER TABLE record ADD COLUMN embedding vector(1024);

CREATE INDEX idx_record_embedding ON record
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
