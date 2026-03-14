-- Add notebook column to record table
ALTER TABLE record ADD COLUMN IF NOT EXISTS notebook TEXT;

-- Index for filtering by device + notebook
CREATE INDEX IF NOT EXISTS idx_record_device_notebook ON record(device_id, notebook, created_at DESC);
