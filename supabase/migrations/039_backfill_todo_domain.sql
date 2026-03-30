-- 回填 todo.domain: 所有 domain 为 NULL 的活跃 todo 设为 "生活"（默认维度）
-- 后续新 todo 由 AI (estimateBatchTodos) 正确赋值 domain
UPDATE todo SET domain = '生活' WHERE domain IS NULL AND done = false;

-- 同样回填 level>=1 的目标
UPDATE todo SET domain = '生活' WHERE domain IS NULL AND level >= 1 AND status != 'archived';
