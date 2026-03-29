-- 领域词汇表：存储用户/设备的领域专业术语，用于语音识别纠错
CREATE TABLE IF NOT EXISTS domain_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id),
  user_id UUID REFERENCES app_user(id),
  term TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  domain TEXT NOT NULL,
  frequency INT DEFAULT 0,
  source TEXT DEFAULT 'preset' CHECK (source IN ('preset','user','auto')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vocab_device_domain ON domain_vocabulary(device_id, domain);
CREATE INDEX IF NOT EXISTS idx_vocab_aliases ON domain_vocabulary USING GIN(aliases);
