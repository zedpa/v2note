-- 删除 record.domain 的固定值 CHECK 约束
-- 产品重新定位：domain 改为自由文本路径格式（如 "工作/v2note/产品定位"）
ALTER TABLE record DROP CONSTRAINT IF EXISTS chk_record_domain;
