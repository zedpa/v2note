-- Time management fields for todos
ALTER TABLE todo ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS scheduled_start timestamptz;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS scheduled_end timestamptz;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS priority integer DEFAULT 3;
ALTER TABLE todo ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Index for finding pending todos with schedules
CREATE INDEX IF NOT EXISTS idx_todo_scheduled ON todo (scheduled_start, scheduled_end) WHERE done = false;

-- Index for finding todos by priority
CREATE INDEX IF NOT EXISTS idx_todo_priority ON todo (priority DESC) WHERE done = false;

-- Update completed_at when todo is marked as done
CREATE OR REPLACE FUNCTION update_todo_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.done = true AND OLD.done = false THEN
    NEW.completed_at = NOW();
  ELSIF NEW.done = false AND OLD.done = true THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_todo_completed_at ON todo;
CREATE TRIGGER trigger_todo_completed_at
  BEFORE UPDATE ON todo
  FOR EACH ROW
  EXECUTE FUNCTION update_todo_completed_at();
