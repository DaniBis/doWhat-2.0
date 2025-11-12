-- Remove legacy seeded activity helpers and ensure nearby lookups return genuine data
BEGIN;

-- Drop the development-only seeding helper if present
DROP FUNCTION IF EXISTS public.seed_activities(double precision, double precision, integer, integer);

-- Purge previously seeded placeholder rows
DELETE FROM public.activities WHERE tags && ARRAY['seed'];

-- Ensure nearby RPC excludes seeded rows and returns descriptive metadata
CREATE OR REPLACE FUNCTION public.activities_nearby(
  lat double precision,
  lng double precision,
  radius_m integer DEFAULT 2000,
  types text[] DEFAULT NULL,
  tags text[] DEFAULT NULL,
  limit_rows integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  venue text,
  lat_out double precision,
  lng_out double precision,
  distance_m double precision,
  activity_types text[],
  tags text[],
  traits text[]
) LANGUAGE sql STABLE AS $$
  WITH p AS (
    SELECT ST_SetSRID(ST_MakePoint(lng, lat), 4326) AS pt
  )
  SELECT a.id,
         a.name,
         a.venue,
         a.lat AS lat_out,
         a.lng AS lng_out,
         ST_DistanceSphere(a.geom, p.pt) AS distance_m,
         a.activity_types,
         a.tags,
         a.traits
  FROM activities a, p
  WHERE a.geom IS NOT NULL
    AND ST_DWithin(a.geom, p.pt, radius_m)
    AND (types IS NULL OR a.activity_types && types)
    AND (tags IS NULL OR a.tags && tags)
    AND NOT (a.tags && ARRAY['seed'])
  ORDER BY ST_DistanceSphere(a.geom, p.pt)
  LIMIT limit_rows;
$$;

GRANT EXECUTE ON FUNCTION public.activities_nearby(double precision, double precision, integer, text[], text[], integer)
  TO anon, authenticated;

COMMIT;
