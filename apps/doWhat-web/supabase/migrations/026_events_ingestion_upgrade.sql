-- Migration 026: Upgrade legacy events table to support public ingestion data
-- Safely adds the columns/indexes used by the new ingestion pipeline while
-- preserving the previous reliability/attendance fields.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Ensure event_sources exists (matches definition from migration 015)
CREATE TABLE IF NOT EXISTS public.event_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('ics','rss','jsonld')),
  venue_hint TEXT,
  city TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_status TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  fetch_interval_minutes INTEGER CHECK (fetch_interval_minutes IS NULL OR fetch_interval_minutes >= 15),
  etag TEXT,
  last_modified TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper to add a column only when it is still missing
DO $$
DECLARE
  cols CONSTANT JSONB := '[
    {"name":"source_id","ddl":"ALTER TABLE public.events ADD COLUMN source_id UUID REFERENCES public.event_sources(id) ON DELETE SET NULL"},
    {"name":"source_uid","ddl":"ALTER TABLE public.events ADD COLUMN source_uid TEXT"},
    {"name":"dedupe_key","ddl":"ALTER TABLE public.events ADD COLUMN dedupe_key TEXT"},
    {"name":"normalized_title","ddl":"ALTER TABLE public.events ADD COLUMN normalized_title TEXT"},
    {"name":"title","ddl":"ALTER TABLE public.events ADD COLUMN title TEXT"},
    {"name":"description","ddl":"ALTER TABLE public.events ADD COLUMN description TEXT"},
    {"name":"tags","ddl":"ALTER TABLE public.events ADD COLUMN tags TEXT[] NOT NULL DEFAULT ''{}''::TEXT[]"},
    {"name":"start_at","ddl":"ALTER TABLE public.events ADD COLUMN start_at TIMESTAMPTZ"},
    {"name":"end_at","ddl":"ALTER TABLE public.events ADD COLUMN end_at TIMESTAMPTZ"},
    {"name":"start_bucket","ddl":"ALTER TABLE public.events ADD COLUMN start_bucket TIMESTAMPTZ"},
    {"name":"timezone","ddl":"ALTER TABLE public.events ADD COLUMN timezone TEXT"},
    {"name":"place_id","ddl":"ALTER TABLE public.events ADD COLUMN place_id UUID REFERENCES public.places(id) ON DELETE SET NULL"},
    {"name":"venue_name","ddl":"ALTER TABLE public.events ADD COLUMN venue_name TEXT"},
    {"name":"lat","ddl":"ALTER TABLE public.events ADD COLUMN lat DOUBLE PRECISION"},
    {"name":"lng","ddl":"ALTER TABLE public.events ADD COLUMN lng DOUBLE PRECISION"},
    {"name":"geohash7","ddl":"ALTER TABLE public.events ADD COLUMN geohash7 TEXT"},
    {"name":"address","ddl":"ALTER TABLE public.events ADD COLUMN address TEXT"},
    {"name":"url","ddl":"ALTER TABLE public.events ADD COLUMN url TEXT"},
    {"name":"image_url","ddl":"ALTER TABLE public.events ADD COLUMN image_url TEXT"},
    {"name":"metadata","ddl":"ALTER TABLE public.events ADD COLUMN metadata JSONB NOT NULL DEFAULT ''{}''::JSONB"},
    {"name":"updated_at","ddl":"ALTER TABLE public.events ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"}
  ]'::jsonb;
  col JSONB;
BEGIN
  FOR col IN SELECT * FROM jsonb_array_elements(cols)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = col->>'name'
    ) THEN
      EXECUTE col->>'ddl';
    END IF;
  END LOOP;
END $$;

-- Generated geom column depends on lat/lng
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'geom'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN geom geometry(Point, 4326) GENERATED ALWAYS AS (
        CASE
          WHEN lat IS NOT NULL AND lng IS NOT NULL THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)
          ELSE NULL
        END
      ) STORED;
  END IF;
END $$;

-- Allow both American and British spelling moving forward
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'events'
      AND constraint_name = 'events_status_check'
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_status_check;
  END IF;
  ALTER TABLE public.events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('scheduled','completed','cancelled','canceled'));
END $$;

-- Backfill new time columns from legacy fields when present
UPDATE public.events
SET start_at = starts_at
WHERE start_at IS NULL AND starts_at IS NOT NULL;

UPDATE public.events
SET end_at = ends_at
WHERE end_at IS NULL AND ends_at IS NOT NULL;

UPDATE public.events
SET start_bucket = COALESCE(start_bucket, start_at)
WHERE start_at IS NOT NULL;

-- Ensure dedupe key unique index for upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_events_dedupe_key'
  ) THEN
    CREATE UNIQUE INDEX idx_events_dedupe_key ON public.events (dedupe_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_start_at ON public.events (start_at);
CREATE INDEX IF NOT EXISTS idx_events_place_id ON public.events (place_id);
CREATE INDEX IF NOT EXISTS idx_events_source_id ON public.events (source_id);
CREATE INDEX IF NOT EXISTS idx_events_geom ON public.events USING GIST (geom);

-- Updated_at trigger for the new column
CREATE OR REPLACE FUNCTION public.touch_events_updated_at()
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
    WHERE event_object_table = 'events'
      AND trigger_name = 'trg_events_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_events_set_updated_at
      BEFORE UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.touch_events_updated_at();
  END IF;
END $$;

-- Optional RLS policy to allow read-only access for anonymous users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_public_select'
  ) THEN
    CREATE POLICY events_public_select ON public.events FOR SELECT USING (TRUE);
  END IF;
END $$;

-- End migration 026.
