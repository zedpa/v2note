-- 回填 todo 表中缺失的 user_id / device_id
-- 这些 todo 由 voice-action 或 todo-projector 创建，只有 record_id 没有 ownership 字段
UPDATE todo t
SET user_id = r.user_id,
    device_id = r.device_id
FROM record r
WHERE t.record_id = r.id
  AND t.user_id IS NULL
  AND t.device_id IS NULL;
