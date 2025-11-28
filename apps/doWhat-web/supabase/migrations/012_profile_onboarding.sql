-- Profile onboarding fields required by the mobile auth gate
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS social_handle text,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

-- Case-insensitive uniqueness for usernames
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles (lower(username));

-- Ensure existing rows get deterministic defaults
UPDATE public.profiles
SET
  is_public = COALESCE(is_public, true),
  onboarding_complete = COALESCE(onboarding_complete, false)
WHERE is_public IS NULL OR onboarding_complete IS NULL;
