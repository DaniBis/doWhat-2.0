-- Personality traits column for storing up to five free-form descriptors chosen during signup.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personality_traits text[] DEFAULT '{}'::text[];

-- Ensure the column never contains NULL for easier client handling.
UPDATE public.profiles
SET personality_traits = '{}'::text[]
WHERE personality_traits IS NULL;
