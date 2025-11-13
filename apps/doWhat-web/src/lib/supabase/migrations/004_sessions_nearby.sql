-- Nearby sessions RPC
-- Calculates distance between a given (lat,lng) and venues, filters by optional activity ids and optional day.
-- Returns session fields expected by the app.

create or replace function public.sessions_nearby(
  p_lat double precision,
  p_lng double precision,
  p_km numeric,
  activities uuid[] default null,
  day date default null
)
returns table (
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  price_cents integer,
  activity_id uuid,
  activity_name text,
  venue_id uuid,
  venue_name text,
  venue_lat double precision,
  venue_lng double precision,
  distance_km numeric
) language sql stable as $$
  with params as (
    select
      p_lat as param_lat,
      p_lng as param_lng,
      p_km as km
  ),
  base as (
    select s.id as session_id,
           s.starts_at,
           s.ends_at,
           s.price_cents,
           s.activity_id,
           a.name as activity_name,
           s.venue_id,
           v.name as venue_name,
           v.lat as venue_lat,
           v.lng as venue_lng,
           -- Haversine (approx) in km
           (6371 * acos(
              least(1, greatest(-1,
                cos(radians((select param_lat from params))) * cos(radians(v.lat)) *
                cos(radians(v.lng) - radians((select param_lng from params))) +
                sin(radians((select param_lat from params))) * sin(radians(v.lat))
              ))
           )) as distance_km
    from sessions s
    join activities a on a.id = s.activity_id
    join venues v on v.id = s.venue_id
    where v.lat is not null and v.lng is not null
      and (activities is null or s.activity_id = any(activities))
      and (day is null or date(s.starts_at) = day)
  )
  select *
  from base
  where distance_km <= (select km from params);
$$;

-- Optional helpful indexes
-- create index if not exists venues_lat_lng_idx on public.venues using gist (lat, lng);
-- create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
