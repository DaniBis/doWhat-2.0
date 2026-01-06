-- Migration 027: Ensure sessions.created_by exists for activity listings
-- Some environments missed migration 005, so recreate the column safely and
-- backfill it from the existing host_user_id field.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.sessions
SET created_by = host_user_id
WHERE created_by IS NULL AND host_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON public.sessions(created_by);

-- End migration 027.
