-- 给 todo 表添加 updated_at 列
-- goalRepo 适配层、todoRepo.updateStatus 等多处引用该列
ALTER TABLE todo ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
