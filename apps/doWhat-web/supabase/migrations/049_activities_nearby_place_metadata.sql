-- Migration 049: Include canonical place metadata in activities_nearby RPC
BEGIN;

-- Drop prior signature to allow return type updates
DROP FUNCTION IF EXISTS public.activities_nearby(double precision, double precision, integer, text[], text[], integer);

CREATE FUNCTION public.activities_nearby(
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
  place_id uuid,
  place_label text,
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
         a.place_id,
         a.place_label,
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

