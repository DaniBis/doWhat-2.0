-- Migration 026: Activity catalog + venue mappings
-- Creates canonical activity definitions, manual overrides, and venue mapping tables
-- plus seeds baseline activities (chess, bowling, climbing, yoga).

CREATE TABLE IF NOT EXISTS public.activity_catalog (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  fsq_categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'activity_catalog_id_seq') THEN
    CREATE SEQUENCE public.activity_catalog_id_seq START 100;
  END IF;
  ALTER TABLE public.activity_catalog ALTER COLUMN id SET DEFAULT nextval('public.activity_catalog_id_seq');
END $$;

CREATE OR REPLACE FUNCTION public.touch_activity_catalog_updated_at()
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
    WHERE trigger_name = 'trg_activity_catalog_updated_at'
      AND event_object_table = 'activity_catalog'
  ) THEN
    CREATE TRIGGER trg_activity_catalog_updated_at
      BEFORE UPDATE ON public.activity_catalog
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_activity_catalog_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_manual_overrides (
  activity_id INTEGER NOT NULL REFERENCES public.activity_catalog(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (activity_id, venue_id)
);

CREATE TABLE IF NOT EXISTS public.venue_activities (
  venue_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES public.activity_catalog(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('category','keyword','manual')),
  confidence NUMERIC,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_activities_activity
  ON public.venue_activities (activity_id);

CREATE INDEX IF NOT EXISTS idx_venue_activities_venue
  ON public.venue_activities (venue_id);

ALTER TABLE IF EXISTS public.activities
  ADD COLUMN IF NOT EXISTS catalog_activity_id INTEGER REFERENCES public.activity_catalog(id);

CREATE INDEX IF NOT EXISTS idx_activities_catalog_activity_id
  ON public.activities (catalog_activity_id);

WITH seeds (id, slug, name, description, keywords, fsq_categories) AS (
  VALUES
    (1, 'chess', 'Chess', 'Quiet spaces that welcome chess meetups or lessons.', ARRAY['chess','board game','board games'], ARRAY['4bf58dd8d48988d18d941735']),
    (2, 'bowling', 'Bowling', 'Alleys and entertainment venues with bowling lanes.', ARRAY['bowling','bowling alley'], ARRAY['4bf58dd8d48988d1e4931735']),
    (3, 'climbing', 'Climbing & Bouldering', 'Indoor climbing gyms and bouldering studios.', ARRAY['climbing','bouldering','rock climbing'], ARRAY['4bf58dd8d48988d1e1931735']),
    (4, 'yoga', 'Yoga', 'Studios hosting yoga sessions or workshops.', ARRAY['yoga','meditation'], ARRAY['4bf58dd8d48988d102941735'])
)
INSERT INTO public.activity_catalog AS ac (id, slug, name, description, keywords, fsq_categories)
SELECT id, slug, name, description, keywords, fsq_categories
FROM seeds
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    keywords = EXCLUDED.keywords,
    fsq_categories = EXCLUDED.fsq_categories;

-- Link existing activities (if present) to catalog entries or insert lightweight placeholders
WITH seed_rows AS (
  SELECT id, name, description FROM (
    VALUES
      (1, 'Chess', 'Matchmaking for chess meetups and lessons.'),
      (2, 'Bowling', 'Plan bowling nights and casual leagues.'),
      (3, 'Climbing & Bouldering', 'Indoor climbing gyms and community sessions.'),
      (4, 'Yoga', 'Studios and calm spaces for yoga practitioners.')
  ) AS t(id, name, description)
)
UPDATE public.activities a
SET catalog_activity_id = seed_rows.id
FROM seed_rows
WHERE lower(a.name) = lower(seed_rows.name)
  AND (a.catalog_activity_id IS DISTINCT FROM seed_rows.id OR a.catalog_activity_id IS NULL);

WITH seed_rows AS (
  SELECT id, name, description FROM (
    VALUES
      (1, 'Chess', 'Matchmaking for chess meetups and lessons.'),
      (2, 'Bowling', 'Plan bowling nights and casual leagues.'),
      (3, 'Climbing & Bouldering', 'Indoor climbing gyms and community sessions.'),
      (4, 'Yoga', 'Studios and calm spaces for yoga practitioners.')
  ) AS t(id, name, description)
)
INSERT INTO public.activities (id, name, description, catalog_activity_id, tags)
SELECT uuid_generate_v4(), seed_rows.name, seed_rows.description, seed_rows.id, ARRAY['catalog']
FROM seed_rows
WHERE NOT EXISTS (
  SELECT 1 FROM public.activities a WHERE lower(a.name) = lower(seed_rows.name)
);
