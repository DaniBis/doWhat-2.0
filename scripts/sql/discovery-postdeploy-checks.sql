-- Discovery post-deploy verification pack
-- Run this from the Supabase SQL editor or any PostgreSQL client connected to the target project
-- after the missing discovery migrations have been applied.

-- 1. Schema migration alignment
select
  filename,
  applied_at
from public.schema_migrations
where filename in (
  '045_places_canonical_enforcement.sql',
  '046_events_event_state.sql',
  '047_venues_updated_timestamp.sql',
  '048_map_places_alignment.sql',
  '049_activities_nearby_place_metadata.sql',
  '050_activities_legacy_column_sync.sql',
  '051_event_and_session_reliability_columns.sql',
  '052_activities_place_label_cleanup.sql',
  '060_sessions_place_label_finalize.sql',
  '065_discovery_exposures.sql',
  '066_place_tiles_discovery_cache.sql',
  '067_activity_catalog_city_keyword_pack.sql',
  '068_discovery_query_support_indexes.sql'
)
order by filename asc;

-- Pass expectation:
-- - all 13 filenames appear exactly once

-- 2. Migration 068 index existence
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_activities_geom',
    'idx_activities_activity_types_gin',
    'idx_activities_tags_gin',
    'idx_events_tags_gin',
    'idx_sessions_activity_id_starts_at'
  )
order by indexname asc;

-- Pass expectation:
-- - exactly 5 rows

-- 3. Discovery cache / telemetry readiness
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'place_tiles'
      and column_name = 'discovery_cache'
  ) as has_discovery_cache_column,
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'discovery_exposures'
  ) as has_discovery_exposures_table;

-- Pass expectation:
-- - both values are true

-- 3b. Discovery cache / telemetry index readiness
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_place_tiles_discovery_cache_gin',
    'idx_discovery_exposures_created_at',
    'idx_discovery_exposures_request_id'
  )
order by indexname asc;

-- Pass expectation:
-- - exactly 3 rows

-- 4. Sessions place-label integrity
with normalized as (
  select
    id,
    place_label,
    btrim(coalesce(place_label, '')) as trimmed_label
  from public.sessions
)
select
  count(*) as total_sessions,
  count(*) filter (where place_label is null) as null_count,
  count(*) filter (where trimmed_label = '') as blank_count
from normalized;

-- Pass expectation:
-- - null_count = 0
-- - blank_count = 0

-- 4b. Sessions place-label constraint state
select
  column_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sessions'
  and column_name = 'place_label';

select
  conname,
  convalidated
from pg_constraint
where conrelid = 'public.sessions'::regclass
  and conname = 'sessions_place_label_nonempty';

-- Pass expectation:
-- - is_nullable = 'NO'
-- - sessions_place_label_nonempty exists and is validated

-- 5. Discovery RPC integrity
select
  id,
  name,
  place_id,
  place_label,
  distance_m
from public.activities_nearby(21.0285, 105.8542, 5000, array['climbing'], array['climbing'], 20)
order by distance_m asc
limit 20;

-- Pass expectation:
-- - query executes
-- - returned rows, if any, have non-empty place_label

-- 6. Duplicate regression check
with normalized as (
  select
    lower(btrim(name)) as name_key,
    round(lat::numeric, 5) as lat_key,
    round(lng::numeric, 5) as lng_key,
    count(*) as row_count,
    array_agg(id order by id) as place_ids
  from public.places
  where name is not null
    and btrim(name) <> ''
  group by 1, 2, 3
)
select
  name_key,
  lat_key,
  lng_key,
  row_count,
  place_ids
from normalized
where row_count > 1
order by row_count desc, name_key asc
limit 50;

-- Optional targeted regression:
select
  id,
  name,
  lat,
  lng,
  metadata
from public.places
where lower(name) = 'vietclimb'
order by id asc;

-- Pass expectation:
-- - no unexpected duplicate clusters
-- - one canonical place per actual Vietclimb branch/location

-- 7. Event / activity / session split correctness
select
  count(*) filter (where start_at is null) as events_missing_start_at,
  count(*) filter (where place_id is null and (lat is null or lng is null)) as events_missing_location
from public.events;

select
  count(*) filter (where place_id is null and lat is not null and lng is not null) as activities_without_canonical_place
from public.activities;

select
  count(*) filter (where place_id is null and venue_id is not null) as sessions_without_canonical_place
from public.sessions;

-- Pass expectation:
-- - events_missing_start_at = 0
-- - activities_without_canonical_place and sessions_without_canonical_place are 0
--   or a known reviewed residual

-- 8. Optional post-deploy performance follow-up
-- Run only from a DB-connected machine after the rollout health checks pass.

EXPLAIN (ANALYZE, BUFFERS)
select
  id,
  name,
  place_id,
  place_label,
  distance_m
from public.activities_nearby(21.0285, 105.8542, 5000, array['climbing'], array['climbing'], 20)
order by distance_m asc
limit 20;

EXPLAIN (ANALYZE, BUFFERS)
select
  id,
  title,
  start_at
from public.events
where tags && array['climbing']
  and start_at >= now()
order by start_at asc
limit 20;

EXPLAIN (ANALYZE, BUFFERS)
select
  activity_id,
  count(*)
from public.sessions
where activity_id is not null
  and starts_at >= now()
group by activity_id
order by activity_id asc
limit 20;

-- Pass expectation:
-- - plans complete successfully
-- - the intended 068 indexes appear where relevant
-- - no obvious large sequential scan remains on the operators 068 was added to support
