-- Migration 025: Store Foursquare metadata on places
-- Adds dedicated city + Foursquare ID columns so we can persist
-- the upstream identifiers that power richer map details.

ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS foursquare_id TEXT;

UPDATE public.places
SET city = COALESCE(city, locality)
WHERE locality IS NOT NULL AND (city IS NULL OR city = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_places_foursquare_id
  ON public.places (foursquare_id)
  WHERE foursquare_id IS NOT NULL;
