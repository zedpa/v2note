ALTER TABLE record ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_record_archived ON record(device_id, archived, created_at DESC);
