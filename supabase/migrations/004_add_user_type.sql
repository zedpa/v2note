-- Add user_type to device table for role-based AI differentiation
ALTER TABLE device ADD COLUMN user_type TEXT DEFAULT NULL
  CHECK (user_type IN ('manager', 'creator'));

-- Add structured_data to weekly_review for typed weekly review content
ALTER TABLE weekly_review ADD COLUMN structured_data JSONB DEFAULT NULL;
