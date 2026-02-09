-- V2Note Initial Schema
-- Device-based identity (no login required)

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE device (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_identifier TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'uploading'
                  CHECK (status IN ('uploading','uploaded','processing','completed','failed')),
  audio_path      TEXT,
  duration_seconds INTEGER,
  location_text   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE weekly_review (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end   DATE NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  stats      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, week_start)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_record_device     ON record(device_id, created_at DESC);
CREATE INDEX idx_record_status     ON record(status);
CREATE INDEX idx_todo_record       ON todo(record_id);
CREATE INDEX idx_idea_record       ON idea(record_id);
CREATE INDEX idx_record_tag_record ON record_tag(record_id);
CREATE INDEX idx_record_tag_tag    ON record_tag(tag_id);
CREATE INDEX idx_weekly_review_dev ON weekly_review(device_id, week_start DESC);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-recordings', 'audio-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE device ENABLE ROW LEVEL SECURITY;
ALTER TABLE record ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_review ENABLE ROW LEVEL SECURITY;

-- For anon access (device-based auth via header), we use permissive policies.
-- The app passes device_id as a custom header; edge functions handle writes.
-- Client reads are filtered by device_id passed as a query parameter.

-- Allow anon to read/insert their own device
CREATE POLICY "anon_device_insert" ON device FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_select" ON device FOR SELECT TO anon USING (true);

-- Records: anon can read own records (filtered client-side by device_id)
CREATE POLICY "anon_record_all" ON record FOR ALL TO anon USING (true) WITH CHECK (true);

-- Transcript/summary: accessible via record
CREATE POLICY "anon_transcript_all" ON transcript FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_summary_all" ON summary FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tags are global read, insert
CREATE POLICY "anon_tag_all" ON tag FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_record_tag_all" ON record_tag FOR ALL TO anon USING (true) WITH CHECK (true);

-- Todos and ideas
CREATE POLICY "anon_todo_all" ON todo FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_idea_all" ON idea FOR ALL TO anon USING (true) WITH CHECK (true);

-- Weekly review
CREATE POLICY "anon_weekly_review_all" ON weekly_review FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage: allow upload to audio-recordings bucket
CREATE POLICY "anon_audio_upload" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'audio-recordings');
CREATE POLICY "anon_audio_select" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'audio-recordings');
