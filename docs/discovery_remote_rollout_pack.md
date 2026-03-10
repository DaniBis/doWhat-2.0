# Discovery Remote Rollout Pack

Use this pack from a machine that has working PostgreSQL connectivity to the target Supabase database. The goal is to finish the moderate SQL/discovery path safely before the next filter-focused pass.

## Scope

This pack is intentionally narrow. It is for:

- applying the missing discovery migrations remotely
- verifying that the discovery schema is aligned
- verifying that migration `068_discovery_query_support_indexes.sql` created the intended indexes
- verifying that discovery semantics did not regress

This pack is **not** for a broad SQL rewrite.

## Current Known Remote Gap

As of `2026-03-09`, the target Supabase project is still missing these discovery-critical migrations:

- `060_sessions_place_label_finalize.sql`
- `065_discovery_exposures.sql`
- `066_place_tiles_discovery_cache.sql`
- `067_activity_catalog_city_keyword_pack.sql`
- `068_discovery_query_support_indexes.sql`

Why it matters:

- `060` protects session place-label integrity used by discovery and event/session hydration.
- `065` and `066` are part of the moderate discovery measurement/cache baseline.
- `067` supports more stable activity matching.
- `068` adds the query-support indexes intended to speed the hot discovery paths.

Re-check this list immediately before rollout with:

```bash
node scripts/health-migrations.mjs --dowhat --remote-rest --strict
```

## Preconditions

1. From any machine with the project env loaded, confirm the target project first with the read-only migration health check:

```bash
node scripts/health-migrations.mjs --dowhat --remote-rest --strict
```

Pass:
- exit code `0`
- no missing migrations reported

Fail:
- exit code `1`
- missing migrations listed in deterministic order with reasons

2. Confirm the DB-connected machine has the correct target connection string:

```bash
echo "$SUPABASE_DB_URL"
```

or

```bash
echo "$DATABASE_URL"
```

Do not run the migration step until the connection string clearly points at the intended Supabase project.

## Exact Human Sequence

Use these steps in order. Do not skip ahead.

1. Read this document and [discovery-postdeploy-checks.sql](/Users/danielbisceanu/doWhat/scripts/sql/discovery-postdeploy-checks.sql).
2. Run `node scripts/health-migrations.mjs --dowhat --remote-rest --strict`.
3. If the command reports missing discovery migrations, move to a DB-connected machine.
4. On the DB-connected machine, run `pnpm db:migrate`.
5. Re-run:
   - `node scripts/health-migrations.mjs --dowhat --strict`
   - `node scripts/health-migrations.mjs --dowhat --remote-rest --strict`
6. Run the SQL pack in `scripts/sql/discovery-postdeploy-checks.sql`.
7. Run the repo-side verification commands from the "Post-Deploy Verification Commands" section.
8. Run the optional `EXPLAIN (ANALYZE, BUFFERS)` follow-up if DB access allows it.
9. Only after the rollout evidence is recorded should the team move to event/session/place truth hardening.

## Apply Missing Migrations

Run the repo migration runner from the DB-connected machine:

```bash
pnpm db:migrate
```

Expected result:
- already-applied migrations are skipped
- the missing remote migrations are applied in filename order
- for the discovery follow-up baseline, this should include at least:
  - `060_sessions_place_label_finalize.sql`
  - `065_discovery_exposures.sql`
  - `066_place_tiles_discovery_cache.sql`
  - `067_activity_catalog_city_keyword_pack.sql`
  - `068_discovery_query_support_indexes.sql`

If you cannot use `pnpm db:migrate` and must apply files manually, preserve this exact order:

1. `060_sessions_place_label_finalize.sql`
2. `065_discovery_exposures.sql`
3. `066_place_tiles_discovery_cache.sql`
4. `067_activity_catalog_city_keyword_pack.sql`
5. `068_discovery_query_support_indexes.sql`

Do not manually edit `public.schema_migrations` to fake completion.

Immediately re-check:

```bash
node scripts/health-migrations.mjs --dowhat --strict
node scripts/health-migrations.mjs --dowhat --remote-rest --strict
```

Pass:
- both commands exit `0`
- no missing migrations reported

Fail:
- any missing migration or missing required public table

## SQL Verification Pack

Run the following SQL in the target DB after the migration step. The same checks are also collected in [discovery-postdeploy-checks.sql](/Users/danielbisceanu/doWhat/scripts/sql/discovery-postdeploy-checks.sql) for direct use in the Supabase SQL editor.

### 1. Schema migration alignment

```sql
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
```

Pass:
- all `13` filenames appear exactly once

Fail:
- any missing row

### 2. Migration 068 index existence

```sql
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
```

Pass:
- exactly `5` rows

Fail:
- any missing index

### 3. Discovery cache / telemetry readiness

```sql
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
```

Pass:
- both values are `true`

Fail:
- either value is `false`

### 3b. Discovery cache / telemetry index readiness

```sql
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
```

Pass:
- exactly `3` rows

Fail:
- any missing index

### 4. Sessions place-label integrity

```sql
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
```

Pass:
- `null_count = 0`
- `blank_count = 0`

Fail:
- any missing/blank `place_label`

### 4b. Sessions place-label constraint state

```sql
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
```

Pass:
- `is_nullable = 'NO'`
- `sessions_place_label_nonempty` exists and `convalidated = true`

Fail:
- nullable `place_label`
- missing or unvalidated non-empty constraint

### 5. Discovery RPC integrity

```sql
select
  id,
  name,
  place_id,
  place_label,
  distance_m
from public.activities_nearby(21.0285, 105.8542, 5000, array['climbing'], array['climbing'], 20)
order by distance_m asc
limit 20;
```

Pass:
- query executes
- returned rows, if any, have non-empty `place_label`

Fail:
- function error
- returned rows with blank `place_label`

### 6. Duplicate regression check

```sql
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
```

Pass:
- no obvious provider-duplicate clusters that should have collapsed already

Fail:
- duplicate clusters appear unexpectedly after rollout

Optional targeted regression:

```sql
select
  id,
  name,
  lat,
  lng,
  metadata
from public.places
where lower(name) = 'vietclimb'
order by id asc;
```

Pass:
- one canonical place per actual branch/location

### 7. Event / activity / session split correctness

```sql
select
  count(*) filter (where start_at is null) as events_missing_start_at,
  count(*) filter (where place_id is null and (lat is null or lng is null)) as events_missing_location
from public.events;
```

```sql
select
  count(*) filter (where place_id is null and lat is not null and lng is not null) as activities_without_canonical_place
from public.activities;
```

```sql
select
  count(*) filter (where place_id is null and venue_id is not null) as sessions_without_canonical_place
from public.sessions;
```

Pass:
- `events_missing_start_at = 0`
- `activities_without_canonical_place` and `sessions_without_canonical_place` are `0` or a known reviewed residual

Fail:
- events are missing `start_at`
- large unexplained counts of activities/sessions without canonical place linkage

## Post-Deploy Verification Commands

Run these from the repo after the SQL rollout:

```bash
node scripts/verify-discovery-rollout-pack.mjs
node scripts/verify-discovery-sql-contract.mjs
node scripts/verify-discovery-contract.mjs
pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts
pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts
```

Expected result:
- all commands exit `0`

## Optional Post-Deploy Performance Follow-Up

These checks require real DB access and are not verifiable from this shell. Run them only after the migration health checks and SQL pack pass.

```sql
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
```

```sql
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
```

```sql
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
```

Pass:
- the plans complete successfully
- the new `068` indexes appear where relevant
- no obvious large sequential scan remains on the hot-path operators that the new indexes were meant to support

Fail:
- plans error
- the expected `068` indexes never appear in the relevant plans
- query cost or latency is clearly dominated by an unexpected full scan

## Optional Live Checks

If the web app is reachable after deploy, spot-check:

```bash
curl -s "$APP_URL/api/nearby?lat=21.0285&lng=105.8542&radius=5000&limit=20&debug=1"
curl -s "$APP_URL/api/events?limit=20&verifiedOnly=1"
```

Pass:
- `/api/nearby` returns a valid activity payload
- `/api/events` returns a valid events payload
- no mixed “raw activities inside events” behavior appears

## Caution Notes

- `run_migrations.js` replays every migration not present in `public.schema_migrations`. Verify the connection string before running it.
- `060_sessions_place_label_finalize.sql` finalizes session place-label integrity. If it fails, inspect session/place-label health before retrying.
- `065`–`068` are additive and low-risk, but they still should not be hand-marked as applied without actually running them.
- This shell cannot prove remote completion, remote plan usage, or post-`068` latency. A human with DB access still has to execute the rollout and capture the evidence.
- Older remote `venue_activities` rows may still contain stale hospitality-era matches. This rollout does not clean them up; that belongs to the later event/session/place truth pass.
- Do not start canonical place-scope normalization around `geom` until:
  - the missing remote migrations are deployed,
  - migration health passes,
  - and a real post-deploy plan/performance pass is available.
- Do not start the final filter UX redesign until:
  - remote rollout is complete,
  - post-deploy verification is recorded,
  - and the event/session/place truth pass has been completed.

## Rollback Guidance

No routine rollback is recommended from this pack.

These migrations are additive and should be handled under DBA supervision if rollback is truly necessary. If a migration fails, fix the cause and rerun the migration flow rather than manually editing `public.schema_migrations` or dropping discovery indexes casually.
