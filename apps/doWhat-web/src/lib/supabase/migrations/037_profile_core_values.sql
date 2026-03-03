-- Migration 037: add onboarding core values to profiles
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS core_values text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_core_values_max_items'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_core_values_max_items
      CHECK (COALESCE(array_length(core_values, 1), 0) <= 3);
  END IF;
END $$;
