-- Migration 045: Canonical places + map labels enforcement
BEGIN;

-- Ensure events.place_label column exists for downstream API responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'place_label'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN place_label TEXT;
  END IF;
END $$;

-- Ensure activities reference canonical places
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'place_id'
  ) THEN
    ALTER TABLE public.activities
      ADD COLUMN place_id UUID REFERENCES public.places(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS idx_events_place_id ON public.events(place_id);
CREATE INDEX IF NOT EXISTS idx_activities_place_id ON public.activities(place_id);

-- Backfill events.place_label from canonical places / fallbacks
WITH derived AS (
  SELECT
    e.id,
    COALESCE(
      NULLIF(p.name, ''),
      NULLIF(e.venue_name, ''),
      NULLIF(e.metadata->>'place_label', ''),
      NULLIF(e.metadata->>'venue', ''),
      'Location to be confirmed'
    ) AS label
  FROM public.events e
  LEFT JOIN public.places p ON p.id = e.place_id
  WHERE e.place_label IS NULL OR btrim(e.place_label) = ''
)
UPDATE public.events AS e
SET place_label = derived.label
FROM derived
WHERE derived.id = e.id;

-- Attempt to match existing places to activities missing place_id
WITH matched AS (
  SELECT a.id AS activity_id, place_lookup.place_id
  FROM public.activities a
  JOIN LATERAL (
    SELECT p.id AS place_id,
           ROW_NUMBER() OVER (
             ORDER BY ST_DistanceSphere(
               ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
               ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)
             )
           ) AS rn
    FROM public.places p
    WHERE a.lat IS NOT NULL
      AND a.lng IS NOT NULL
      AND p.lat BETWEEN a.lat - 0.002 AND a.lat + 0.002
      AND p.lng BETWEEN a.lng - 0.002 AND a.lng + 0.002
  ) AS place_lookup ON TRUE
  WHERE a.place_id IS NULL AND place_lookup.rn = 1
)
UPDATE public.activities a
SET place_id = matched.place_id
FROM matched
WHERE a.id = matched.activity_id AND a.place_id IS NULL;

-- Insert placeholder places for unmatched activities so they can be linked going forward
WITH missing AS (
  SELECT
    a.id,
    COALESCE(NULLIF(a.venue, ''), NULLIF(a.name, ''), 'Location to be confirmed') AS label,
    a.lat,
    a.lng
  FROM public.activities a
  WHERE a.place_id IS NULL
    AND a.lat IS NOT NULL
    AND a.lng IS NOT NULL
),
coords AS (
  SELECT DISTINCT ON (round(lat::numeric, 5), round(lng::numeric, 5))
         round(lat::numeric, 5) AS lat_round,
         round(lng::numeric, 5) AS lng_round,
         label,
         md5(round(lat::numeric, 5)::text || ':' || round(lng::numeric, 5)::text) AS coord_hash
  FROM missing
  ORDER BY round(lat::numeric, 5), round(lng::numeric, 5), label
)
INSERT INTO public.places (
  name,
  lat,
  lng,
  categories,
  tags,
  address,
  locality,
  region,
  country,
  metadata
)
SELECT
  COALESCE(label, 'Location to be confirmed') AS name,
  lat_round,
  lng_round,
  '{}'::text[],
  '{}'::text[],
  NULL,
  NULL,
  NULL,
  NULL,
  jsonb_build_object(
    'source', 'activity_backfill',
    'coord_hash', coord_hash,
    'resolved_at', NOW()
  )
FROM coords c
WHERE NOT EXISTS (
  SELECT 1 FROM public.places p
  WHERE ABS(p.lat - c.lat_round) <= 0.0005
    AND ABS(p.lng - c.lng_round) <= 0.0005
);

-- Relink any remaining activities (including ones covered by new placeholders)
WITH unmatched AS (
  SELECT a.id, a.lat, a.lng
  FROM public.activities a
  WHERE a.place_id IS NULL
    AND a.lat IS NOT NULL
    AND a.lng IS NOT NULL
),
best AS (
  SELECT
    u.id AS activity_id,
    p.id AS place_id,
    ROW_NUMBER() OVER (
      PARTITION BY u.id
      ORDER BY ST_DistanceSphere(
        ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
        ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)
      )
    ) AS rn
  FROM unmatched u
  JOIN public.places p
    ON p.lat BETWEEN u.lat - 0.001 AND u.lat + 0.001
   AND p.lng BETWEEN u.lng - 0.001 AND u.lng + 0.001
)
UPDATE public.activities a
SET place_id = best.place_id
FROM best
WHERE a.id = best.activity_id AND best.rn = 1;

-- Normalize any lingering empty labels on events
UPDATE public.events
SET place_label = 'Location to be confirmed'
WHERE place_label IS NULL OR btrim(place_label) = '';

COMMIT;
