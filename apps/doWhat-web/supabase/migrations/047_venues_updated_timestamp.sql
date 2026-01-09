-- Migration 047: ensure venues expose updated_at for recency queries
-- Adds an updated_at column (with trigger) so mobile/web discovery APIs can
-- order venues deterministically without relying on environment-specific columns.

ALTER TABLE IF EXISTS public.venues
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.venues
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.venues
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_table = 'venues'
      AND trigger_name = 'trg_venues_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_venues_set_updated_at
      BEFORE UPDATE ON public.venues
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
