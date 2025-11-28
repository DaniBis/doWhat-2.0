-- Migration 015: Events ingestion tables
-- Creates event_sources and events tables to support multi-channel ingestion
-- of public event feeds (ICS, RSS, JSON-LD) along with supporting indexes
-- and row-level security policies.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

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

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES public.event_sources(id) ON DELETE SET NULL,
  source_uid TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  normalized_title TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  start_bucket TIMESTAMPTZ NOT NULL,
  timezone TEXT,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  venue_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    ELSE NULL END
  ) STORED,
  geohash7 TEXT,
  address TEXT,
  url TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  has_lat boolean := false;
  has_lng boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='lat'
  ) INTO has_lat;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='lng'
  ) INTO has_lng;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='geom'
  ) AND has_lat AND has_lng THEN
    ALTER TABLE public.events
      ADD COLUMN geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
        CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)
        ELSE NULL END
      ) STORED;
  ELSIF NOT has_lat OR NOT has_lng THEN
    RAISE NOTICE '[events] lat/lng missing; skipping geom column addition';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='geom'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_geom ON public.events USING GIST (geom)';
  ELSE
    RAISE NOTICE '[events] geom column missing; skipping spatial index creation';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='start_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_start_at ON public.events (start_at)';
  ELSE
    RAISE NOTICE '[events] start_at missing; skipping idx_events_start_at';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='place_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_place_id ON public.events (place_id)';
  ELSE
    RAISE NOTICE '[events] place_id missing; skipping idx_events_place_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='source_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_source_id ON public.events (source_id)';
  ELSE
    RAISE NOTICE '[events] source_id missing; skipping idx_events_source_id';
  END IF;
END $$;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_public_select'
  ) THEN
    CREATE POLICY events_public_select ON public.events
      FOR SELECT USING (TRUE);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_sources' AND policyname='event_sources_service_only'
  ) THEN
    CREATE POLICY event_sources_service_only ON public.event_sources
      FOR ALL USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_event_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_event_sources_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_event_sources_set_updated_at
      BEFORE UPDATE ON public.event_sources
      FOR EACH ROW EXECUTE FUNCTION public.touch_event_sources_updated_at();
  END IF;
END $$;

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
    SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_events_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_events_set_updated_at
      BEFORE UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.touch_events_updated_at();
  END IF;
END $$;

-- End migration 015.
