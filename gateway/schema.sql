-- ============================================================
-- V2Note Consolidated Schema (for RDS PostgreSQL)
-- Combines migrations 001-006 into a single schema file.
-- Run this on a fresh PostgreSQL database.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE device (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_identifier TEXT NOT NULL UNIQUE,
  platform          TEXT NOT NULL DEFAULT 'unknown',
  user_type         TEXT DEFAULT NULL CHECK (user_type IN ('manager', 'creator')),
  custom_tags       JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE record (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'uploading'
                   CHECK (status IN ('uploading','uploaded','processing','completed','failed')),
  source           TEXT NOT NULL DEFAULT 'voice' CHECK (source IN ('voice', 'manual')),
  archived         BOOLEAN NOT NULL DEFAULT false,
  audio_path       TEXT,
  duration_seconds INTEGER,
  location_text    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transcript (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID NOT NULL UNIQUE REFERENCES record(id) ON DELETE CASCADE,
  text       TEXT NOT NULL DEFAULT '',
  language   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE summary (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id     UUID NOT NULL UNIQUE REFERENCES record(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  short_summary TEXT NOT NULL DEFAULT '',
  long_summary  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tag (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE record_tag (
  record_id UUID NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (record_id, tag_id)
);

CREATE TABLE todo (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  period          TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  summary         TEXT,
  stats           JSONB,
  structured_data JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, period, period_start)
);

-- AI Agent tables

CREATE TABLE memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID REFERENCES device(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  source_date DATE,
  importance  INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE soul (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  UUID REFERENCES device(id) ON DELETE CASCADE UNIQUE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE skill_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  UUID REFERENCES device(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  enabled    BOOLEAN DEFAULT true,
  config     JSONB DEFAULT '{}',
  UNIQUE(device_id, skill_name)
);

CREATE TABLE customer_request (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID REFERENCES record(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE setting_change (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID REFERENCES record(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  applied    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_record_device      ON record(device_id, created_at DESC);
CREATE INDEX idx_record_status      ON record(status);
CREATE INDEX idx_record_archived    ON record(device_id, archived, created_at DESC);
CREATE INDEX idx_todo_record        ON todo(record_id);
CREATE INDEX idx_idea_record        ON idea(record_id);
CREATE INDEX idx_record_tag_record  ON record_tag(record_id);
CREATE INDEX idx_record_tag_tag     ON record_tag(tag_id);
CREATE INDEX idx_review_device      ON review(device_id, period_start DESC);
CREATE INDEX idx_memory_device      ON memory(device_id);
CREATE INDEX idx_memory_date        ON memory(device_id, source_date);
CREATE INDEX idx_customer_request   ON customer_request(record_id);
CREATE INDEX idx_setting_change     ON setting_change(record_id);
