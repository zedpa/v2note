-- ============================================
-- Migration 006: AI Agent Platform tables
-- ============================================

-- 长期记忆表
CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES device(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_date DATE,
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_device ON memory(device_id);
CREATE INDEX idx_memory_date ON memory(device_id, source_date);

ALTER TABLE memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_device_policy ON memory
  USING (device_id = current_setting('app.device_id', true)::uuid);

-- Soul 表（用户画像）
CREATE TABLE IF NOT EXISTS soul (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES device(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE soul ENABLE ROW LEVEL SECURITY;
CREATE POLICY soul_device_policy ON soul
  USING (device_id = current_setting('app.device_id', true)::uuid);

-- Skill 配置表
CREATE TABLE IF NOT EXISTS skill_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES device(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  UNIQUE(device_id, skill_name)
);

ALTER TABLE skill_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_config_device_policy ON skill_config
  USING (device_id = current_setting('app.device_id', true)::uuid);

-- 客户要求表
CREATE TABLE IF NOT EXISTS customer_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES record(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_customer_request_record ON customer_request(record_id);

ALTER TABLE customer_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_request_device_policy ON customer_request
  USING (record_id IN (
    SELECT id FROM record WHERE device_id = current_setting('app.device_id', true)::uuid
  ));

-- 设置修改表
CREATE TABLE IF NOT EXISTS setting_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES record(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_setting_change_record ON setting_change(record_id);

ALTER TABLE setting_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY setting_change_device_policy ON setting_change
  USING (record_id IN (
    SELECT id FROM record WHERE device_id = current_setting('app.device_id', true)::uuid
  ));

-- Add 'source' column to record table for tracking origin (voice, text, todo_aggregate, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'record' AND column_name = 'source'
  ) THEN
    ALTER TABLE record ADD COLUMN source TEXT DEFAULT 'voice';
  END IF;
END $$;
