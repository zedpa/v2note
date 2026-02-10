ALTER TABLE record ADD COLUMN source TEXT NOT NULL DEFAULT 'voice'
  CHECK (source IN ('voice', 'manual'));
