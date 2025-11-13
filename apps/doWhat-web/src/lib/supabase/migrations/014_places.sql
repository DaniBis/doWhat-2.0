-- Migration 014: Places layer (aggregated + cached locations)
-- Adds core tables for storing normalized places, provider-level snapshots,
-- and request metrics used to monitor cache hit rate / latency.

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Core places catalogue: durable canonical rows aggregated from providers
CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  address TEXT,
  locality TEXT,
  region TEXT,
  country TEXT,
  postcode TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
  aggregated_from TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  primary_source TEXT,
  popularity_score NUMERIC,
  rating NUMERIC,
  rating_count INTEGER,
  price_level SMALLINT,
  phone TEXT,
  website TEXT,
  attribution JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '21 days',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_geom ON public.places USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_places_categories ON public.places USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_places_tags ON public.places USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_places_cache_expires ON public.places (cache_expires_at);

-- Provider snapshots (one row per provider place id) storing raw metadata
CREATE TABLE IF NOT EXISTS public.place_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id UUID REFERENCES public.places(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_place_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_refresh_at TIMESTAMPTZ,
  confidence NUMERIC,
  name TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  url TEXT,
  attribution JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE(provider, provider_place_id)
);

CREATE INDEX IF NOT EXISTS idx_place_sources_place_id ON public.place_sources(place_id);
CREATE INDEX IF NOT EXISTS idx_place_sources_provider ON public.place_sources(provider);

-- Request-level metrics for observability
CREATE TABLE IF NOT EXISTS public.place_request_metrics (
  id BIGSERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sw_lat DOUBLE PRECISION,
  sw_lng DOUBLE PRECISION,
  ne_lat DOUBLE PRECISION,
  ne_lng DOUBLE PRECISION,
  categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  cache_hit BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  provider_counts JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_place_request_metrics_requested_at
  ON public.place_request_metrics USING BRIN (requested_at);

-- Row level security: expose read access to places catalogue
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'places' AND policyname = 'places_public_select'
  ) THEN
    CREATE POLICY places_public_select ON public.places FOR SELECT USING (TRUE);
  END IF;
END $$;

-- Do not expose raw provider snapshots / metrics to anon users (service role only)
ALTER TABLE public.place_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_request_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'place_sources' AND policyname = 'place_sources_service_only'
  ) THEN
    CREATE POLICY place_sources_service_only ON public.place_sources FOR ALL USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'place_request_metrics' AND policyname = 'place_request_metrics_service_only'
  ) THEN
    CREATE POLICY place_request_metrics_service_only ON public.place_request_metrics FOR ALL USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

-- Ensure updated_at tracks modifications
CREATE OR REPLACE FUNCTION public.touch_places_updated_at()
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
    WHERE event_object_table = 'places' AND trigger_name = 'trg_places_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_places_set_updated_at
    BEFORE UPDATE ON public.places
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_places_updated_at();
  END IF;
END $$;

-- End migration 014.
