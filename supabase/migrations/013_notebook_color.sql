ALTER TABLE notebook ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';

-- Set default colors for system notebooks
UPDATE notebook SET color = '#8b5cf6' WHERE name = 'ai-self' AND color = '#6366f1';
UPDATE notebook SET color = '#f59e0b' WHERE name = 'default' AND color = '#6366f1';
