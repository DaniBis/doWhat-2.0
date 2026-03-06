-- Migration 066: add discovery cache payload storage on place tiles

ALTER TABLE public.place_tiles
  ADD COLUMN IF NOT EXISTS discovery_cache JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_place_tiles_discovery_cache_gin
  ON public.place_tiles
  USING GIN (discovery_cache);
