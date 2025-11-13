-- Migration 016: places geohash + tile cache

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS geohash6 TEXT,
  ADD COLUMN IF NOT EXISTS source_confidence NUMERIC;

CREATE INDEX IF NOT EXISTS idx_places_geohash6 ON public.places(geohash6);
CREATE INDEX IF NOT EXISTS idx_places_categories_gin ON public.places USING GIN (categories);

CREATE TABLE IF NOT EXISTS public.place_tiles (
  geohash6 TEXT PRIMARY KEY,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  provider_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_place_tiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'place_tiles' AND trigger_name = 'trg_place_tiles_updated_at'
  ) THEN
    CREATE TRIGGER trg_place_tiles_updated_at
    BEFORE UPDATE ON public.place_tiles
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_place_tiles_updated_at();
  END IF;
END $$;
