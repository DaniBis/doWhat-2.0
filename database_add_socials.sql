-- Migration: add social media columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS twitter text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS linkedin text;

-- Optional simple indexes for lookup by handle (case-insensitive) if needed later
-- CREATE INDEX IF NOT EXISTS profiles_twitter_ci_idx ON profiles (lower(twitter));
-- CREATE INDEX IF NOT EXISTS profiles_instagram_ci_idx ON profiles (lower(instagram));
