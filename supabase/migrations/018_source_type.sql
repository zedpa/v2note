-- Add source_type to distinguish user's own thoughts from external materials
ALTER TABLE record ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'think'
  CHECK (source_type IN ('think', 'material'));
