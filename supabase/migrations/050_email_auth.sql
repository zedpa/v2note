-- 050: Email authentication support
-- app_user 增加 email + avatar_url 字段，phone 改为可选

-- 1. 新增 email 列 + partial unique index
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email) WHERE email IS NOT NULL;

-- 2. 新增 avatar_url 列
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. phone 改为可选（原为 NOT NULL）
ALTER TABLE app_user ALTER COLUMN phone DROP NOT NULL;

-- 4. CHECK 约束：phone 和 email 至少有一个
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_identity'
  ) THEN
    ALTER TABLE app_user ADD CONSTRAINT chk_user_identity
      CHECK (phone IS NOT NULL OR email IS NOT NULL);
  END IF;
END $$;

-- 5. ���证码表
CREATE TABLE IF NOT EXISTS email_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'register',
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_lookup
  ON email_verification(email, used, expires_at);
