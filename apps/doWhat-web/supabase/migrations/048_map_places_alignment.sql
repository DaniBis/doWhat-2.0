-- Migration 048: Canonical place linkage for map entities
-- Ensures activities, sessions, and events consistently persist place_id + place_label
-- and that events expose a dedicated event_state for scheduling.
BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Activities: name/venue/place_id/place_label + best-effort backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS venue TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_label TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'title'
  ) THEN
    UPDATE public.activities
    SET name = title
    WHERE (name IS NULL OR btrim(name) = '')
      AND title IS NOT NULL
      AND btrim(title) <> '';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'location'
  ) THEN
    UPDATE public.activities
    SET venue = location
    WHERE (venue IS NULL OR btrim(venue) = '')
      AND location IS NOT NULL
      AND btrim(location) <> '';
  END IF;
END $$;

-- Link activities to existing nearby places
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

-- Insert placeholder places for unmatched activities (stable per rounded coords)
WITH missing AS (
  SELECT
    a.id,
    COALESCE(NULLIF(a.place_label, ''), NULLIF(a.venue, ''), NULLIF(a.name, ''), 'Unnamed spot') AS label,
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
  metadata
)
SELECT
  COALESCE(label, 'Unnamed spot') AS name,
  lat_round,
  lng_round,
  '{}'::text[],
  '{}'::text[],
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

-- Relink any remaining activities (including ones covered by placeholders)
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
WHERE a.id = best.activity_id AND best.rn = 1 AND a.place_id IS NULL;

-- Backfill activity place labels from canonical place / fallbacks
WITH derived AS (
  SELECT
    a.id,
    COALESCE(
      NULLIF(p.name, ''),
      NULLIF(a.venue, ''),
      NULLIF(a.name, ''),
      'Unnamed spot'
    ) AS label
  FROM public.activities a
  LEFT JOIN public.places p ON p.id = a.place_id
  WHERE a.place_label IS NULL OR btrim(a.place_label) = ''
)
UPDATE public.activities a
SET place_label = derived.label
FROM derived
WHERE derived.id = a.id;

CREATE INDEX IF NOT EXISTS idx_activities_place_id ON public.activities(place_id);

-- ---------------------------------------------------------------------------
-- Sessions: place_id/place_label + best-effort backfill from activity/venue
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_label TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_place_id ON public.sessions(place_id);

-- Prefer activity place when available
UPDATE public.sessions s
SET place_id = a.place_id
FROM public.activities a
WHERE s.place_id IS NULL
  AND s.activity_id = a.id
  AND a.place_id IS NOT NULL;

-- Match sessions to nearby places using venue coordinates
WITH matched AS (
  SELECT s.id AS session_id, place_lookup.place_id
  FROM public.sessions s
  JOIN public.venues v ON v.id = s.venue_id
  JOIN LATERAL (
    SELECT p.id AS place_id,
           ROW_NUMBER() OVER (
             ORDER BY ST_DistanceSphere(
               ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
               ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)
             )
           ) AS rn
    FROM public.places p
    WHERE v.lat IS NOT NULL
      AND v.lng IS NOT NULL
      AND p.lat BETWEEN v.lat - 0.002 AND v.lat + 0.002
      AND p.lng BETWEEN v.lng - 0.002 AND v.lng + 0.002
  ) AS place_lookup ON TRUE
  WHERE s.place_id IS NULL AND place_lookup.rn = 1
)
UPDATE public.sessions s
SET place_id = matched.place_id
FROM matched
WHERE s.id = matched.session_id AND s.place_id IS NULL;

-- Insert placeholder places for sessions missing place_id but having venue coords
WITH missing AS (
  SELECT
    s.id,
    COALESCE(NULLIF(v.name, ''), 'Unnamed spot') AS label,
    v.lat,
    v.lng
  FROM public.sessions s
  JOIN public.venues v ON v.id = s.venue_id
  WHERE s.place_id IS NULL
    AND v.lat IS NOT NULL
    AND v.lng IS NOT NULL
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
  metadata
)
SELECT
  COALESCE(label, 'Unnamed spot') AS name,
  lat_round,
  lng_round,
  '{}'::text[],
  '{}'::text[],
  jsonb_build_object(
    'source', 'session_backfill',
    'coord_hash', coord_hash,
    'resolved_at', NOW()
  )
FROM coords c
WHERE NOT EXISTS (
  SELECT 1 FROM public.places p
  WHERE ABS(p.lat - c.lat_round) <= 0.0005
    AND ABS(p.lng - c.lng_round) <= 0.0005
);

-- Relink any remaining sessions (including ones covered by placeholders)
WITH unmatched AS (
  SELECT s.id, v.lat, v.lng
  FROM public.sessions s
  JOIN public.venues v ON v.id = s.venue_id
  WHERE s.place_id IS NULL
    AND v.lat IS NOT NULL
    AND v.lng IS NOT NULL
),
best AS (
  SELECT
    u.id AS session_id,
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
UPDATE public.sessions s
SET place_id = best.place_id
FROM best
WHERE s.id = best.session_id AND best.rn = 1 AND s.place_id IS NULL;

-- Backfill sessions.place_label for venue-backed sessions
WITH derived AS (
  SELECT
    s.id,
    COALESCE(
      NULLIF(p.name, ''),
      NULLIF(v.name, ''),
      'Unnamed spot'
    ) AS label
  FROM public.sessions s
  JOIN public.venues v ON v.id = s.venue_id
  LEFT JOIN public.places p ON p.id = s.place_id
  WHERE s.place_label IS NULL OR btrim(s.place_label) = ''
)
UPDATE public.sessions s
SET place_label = derived.label
FROM derived
WHERE derived.id = s.id;

-- Backfill sessions.place_label for sessions without venue_id (fallback to activity/place)
WITH derived AS (
  SELECT
    s.id,
    COALESCE(
      NULLIF(p.name, ''),
      NULLIF(a.place_label, ''),
      NULLIF(a.venue, ''),
      NULLIF(a.name, ''),
      'Unnamed spot'
    ) AS label
  FROM public.sessions s
  LEFT JOIN public.activities a ON a.id = s.activity_id
  LEFT JOIN public.places p ON p.id = s.place_id
  WHERE (s.place_label IS NULL OR btrim(s.place_label) = '')
    AND s.venue_id IS NULL
)
UPDATE public.sessions s
SET place_label = derived.label
FROM derived
WHERE derived.id = s.id;

UPDATE public.sessions
SET place_label = 'Unnamed spot'
WHERE place_label IS NULL OR btrim(place_label) = '';

-- ---------------------------------------------------------------------------
-- Events: place_id/place_label + event_state
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_label TEXT,
  ADD COLUMN IF NOT EXISTS event_state TEXT;

ALTER TABLE public.events
  ALTER COLUMN event_state SET DEFAULT 'scheduled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_event_state_check'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_event_state_check
      CHECK (event_state IN ('scheduled', 'canceled'));
  END IF;
END $$;

-- Best-effort: backfill event_state from legacy status when available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'status'
  ) THEN
    UPDATE public.events
    SET event_state = CASE
      WHEN lower(coalesce(status::text, '')) IN ('cancelled', 'canceled') THEN 'canceled'
      ELSE 'scheduled'
    END
    WHERE event_state IS NULL OR btrim(event_state) = '';
  ELSE
    UPDATE public.events
    SET event_state = 'scheduled'
    WHERE event_state IS NULL OR btrim(event_state) = '';
  END IF;
END $$;

-- Link events to places using coordinates when missing place_id
WITH matched AS (
  SELECT e.id AS event_id, place_lookup.place_id
  FROM public.events e
  JOIN LATERAL (
    SELECT p.id AS place_id,
           ROW_NUMBER() OVER (
             ORDER BY ST_DistanceSphere(
               ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
               ST_SetSRID(ST_MakePoint(e.lng, e.lat), 4326)
             )
           ) AS rn
    FROM public.places p
    WHERE e.lat IS NOT NULL
      AND e.lng IS NOT NULL
      AND p.lat BETWEEN e.lat - 0.002 AND e.lat + 0.002
      AND p.lng BETWEEN e.lng - 0.002 AND e.lng + 0.002
  ) AS place_lookup ON TRUE
  WHERE e.place_id IS NULL AND place_lookup.rn = 1
)
UPDATE public.events e
SET place_id = matched.place_id
FROM matched
WHERE e.id = matched.event_id AND e.place_id IS NULL;

-- Insert placeholder places for unmatched events with coordinates
WITH missing AS (
  SELECT
    e.id,
    COALESCE(NULLIF(e.place_label, ''), NULLIF(e.venue_name, ''), NULLIF(e.address, ''), 'Unnamed spot') AS label,
    e.lat,
    e.lng
  FROM public.events e
  WHERE e.place_id IS NULL
    AND e.lat IS NOT NULL
    AND e.lng IS NOT NULL
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
  metadata
)
SELECT
  COALESCE(label, 'Unnamed spot') AS name,
  lat_round,
  lng_round,
  '{}'::text[],
  '{}'::text[],
  jsonb_build_object(
    'source', 'event_backfill',
    'coord_hash', coord_hash,
    'resolved_at', NOW()
  )
FROM coords c
WHERE NOT EXISTS (
  SELECT 1 FROM public.places p
  WHERE ABS(p.lat - c.lat_round) <= 0.0005
    AND ABS(p.lng - c.lng_round) <= 0.0005
);

-- Relink any remaining events (including ones covered by placeholders)
WITH unmatched AS (
  SELECT e.id, e.lat, e.lng
  FROM public.events e
  WHERE e.place_id IS NULL
    AND e.lat IS NOT NULL
    AND e.lng IS NOT NULL
),
best AS (
  SELECT
    u.id AS event_id,
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
UPDATE public.events e
SET place_id = best.place_id
FROM best
WHERE e.id = best.event_id AND best.rn = 1 AND e.place_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_place_id ON public.events(place_id);

-- Backfill events.place_label from canonical places / fallbacks
WITH derived AS (
  SELECT
    e.id,
    COALESCE(
      NULLIF(p.name, ''),
      NULLIF(e.place_label, ''),
      NULLIF(e.venue_name, ''),
      NULLIF(e.metadata->>'place_label', ''),
      NULLIF(e.address, ''),
      'Unnamed spot'
    ) AS label
  FROM public.events e
  LEFT JOIN public.places p ON p.id = e.place_id
  WHERE e.place_label IS NULL OR btrim(e.place_label) = ''
)
UPDATE public.events e
SET place_label = derived.label
FROM derived
WHERE derived.id = e.id;

UPDATE public.events
SET place_label = 'Unnamed spot'
WHERE place_label IS NULL OR btrim(place_label) = '';

COMMIT;
