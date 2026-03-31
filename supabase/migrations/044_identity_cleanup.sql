-- 044: device_id 身份职责下线
-- 所有 UNIQUE 约束从 device_id 维度迁移到 user_id 维度
-- device_id 保留为可选元数据（设备追踪），不再作为用户身份
-- 全部幂等（IF EXISTS / IF NOT EXISTS / DO NOTHING）

-- ============================================================
-- 1. user_profile: UNIQUE(device_id) → UNIQUE(user_id)
-- ============================================================
ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_device_id_key;
ALTER TABLE user_profile ALTER COLUMN device_id DROP NOT NULL;

-- 回填缺失的 user_id
UPDATE user_profile up
SET user_id = d.user_id
FROM device d
WHERE up.device_id = d.id
  AND up.user_id IS NULL
  AND d.user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user_id_unique
  ON user_profile(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 2. notebook: UNIQUE(device_id, name) → UNIQUE(user_id, name)
-- ============================================================
ALTER TABLE notebook DROP CONSTRAINT IF EXISTS notebook_device_id_name_key;
ALTER TABLE notebook ALTER COLUMN device_id DROP NOT NULL;

-- 回填
UPDATE notebook nb
SET user_id = d.user_id
FROM device d
WHERE nb.device_id = d.id
  AND nb.user_id IS NULL
  AND d.user_id IS NOT NULL;

-- 去重：保留每个 (user_id, name) 中最早的一条，删除其余
DELETE FROM notebook
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY created_at) AS rn
    FROM notebook
    WHERE user_id IS NOT NULL
  ) sub WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_user_name_unique
  ON notebook(user_id, name) WHERE user_id IS NOT NULL;

-- 兼容：游客数据保留 device_id 维度约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_device_name_guest
  ON notebook(device_id, name) WHERE user_id IS NULL AND device_id IS NOT NULL;

-- ============================================================
-- 3. soul: UNIQUE(device_id) → 已有 user_id partial index
-- ============================================================
ALTER TABLE soul DROP CONSTRAINT IF EXISTS soul_device_id_key;
ALTER TABLE soul ALTER COLUMN device_id DROP NOT NULL;

-- 回填
UPDATE soul s
SET user_id = d.user_id
FROM device d
WHERE s.device_id = d.id
  AND s.user_id IS NULL
  AND d.user_id IS NOT NULL;

-- user_id partial unique index 已在 014_auth 中创建，确认存在
CREATE UNIQUE INDEX IF NOT EXISTS idx_soul_user_id_unique
  ON soul(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 4. skill_config: UNIQUE(device_id, skill_name) → UNIQUE(user_id, skill_name)
-- ============================================================
ALTER TABLE skill_config DROP CONSTRAINT IF EXISTS skill_config_device_id_skill_name_key;

-- device_id 本身可能无 NOT NULL，但确保可选
DO $$ BEGIN
  ALTER TABLE skill_config ALTER COLUMN device_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 回填
UPDATE skill_config sc
SET user_id = d.user_id
FROM device d
WHERE sc.device_id = d.id
  AND sc.user_id IS NULL
  AND d.user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_config_user_skill_unique
  ON skill_config(user_id, skill_name) WHERE user_id IS NOT NULL;

-- ============================================================
-- 5. ai_diary: UNIQUE(device_id, notebook, entry_date) → UNIQUE(user_id, notebook, entry_date)
-- ============================================================
ALTER TABLE ai_diary DROP CONSTRAINT IF EXISTS ai_diary_device_id_notebook_entry_date_key;
ALTER TABLE ai_diary ALTER COLUMN device_id DROP NOT NULL;

-- 回填
UPDATE ai_diary ad
SET user_id = d.user_id
FROM device d
WHERE ad.device_id = d.id
  AND ad.user_id IS NULL
  AND d.user_id IS NOT NULL;

-- 去重：合并重复日记内容，保留最早的一条
UPDATE ai_diary a
SET full_content = a.full_content || E'\n\n' || dup.full_content,
    summary = LEFT(a.full_content || E'\n\n' || dup.full_content, 200)
FROM (
  SELECT id, user_id, notebook, entry_date, full_content,
         ROW_NUMBER() OVER (PARTITION BY user_id, notebook, entry_date ORDER BY created_at) AS rn
  FROM ai_diary WHERE user_id IS NOT NULL
) dup
WHERE dup.user_id = a.user_id AND dup.notebook = a.notebook AND dup.entry_date = a.entry_date
  AND dup.rn = 2 AND a.id != dup.id
  AND a.id = (SELECT id FROM ai_diary WHERE user_id = a.user_id AND notebook = a.notebook AND entry_date = a.entry_date ORDER BY created_at LIMIT 1);

DELETE FROM ai_diary
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, notebook, entry_date ORDER BY created_at) AS rn
    FROM ai_diary WHERE user_id IS NOT NULL
  ) sub WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_diary_user_notebook_date_unique
  ON ai_diary(user_id, notebook, entry_date) WHERE user_id IS NOT NULL;

-- 兼容：游客数据
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_diary_device_notebook_date_guest
  ON ai_diary(device_id, notebook, entry_date) WHERE user_id IS NULL AND device_id IS NOT NULL;

-- ============================================================
-- 6. daily_briefing: 已在 038 中加了 user_id partial unique index
--    此处仅确保 device_id 可选
-- ============================================================
DO $$ BEGIN
  ALTER TABLE daily_briefing ALTER COLUMN device_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
