# Discovery Verification Checklist

Use these targeted SQL snippets (or the Supabase SQL editor) whenever you need to confirm that map discovery data is healthy. For an automated run, execute `pnpm health:place-labels` (or `node scripts/health-place-labels.mjs`) before deploying.

## 1. Sessions: enforce `place_label`
```sql
with normalized as (
  select
    id,
    place_label,
    btrim(coalesce(place_label, '')) as trimmed_label,
    place_id,
    venue_id,
    activity_id
  from sessions
)
select
  count(*) as total_sessions,
  count(*) filter (where place_label is null) as null_count,
  count(*) filter (where trimmed_label = '') as blank_count,
  count(*) filter (where place_label is null or trimmed_label = '') as missing_total,
  count(*) filter (where place_label is null and place_id is not null) as null_with_place,
  count(*) filter (where place_label is null and venue_id is not null) as null_with_venue,
  count(*) filter (where place_label is null and activity_id is not null) as null_with_activity
from normalized;
```

## 2. Session column + constraint checks
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

Expect `is_nullable = 'NO'` and a validated `sessions_place_label_nonempty` constraint row.

## 3. Activities: confirm canonical place labels
```sql
select
  count(*) filter (where a.place_id is not null and (p.name is null or btrim(p.name) = '')) as activities_missing_place_name,
  count(*) filter (where coalesce(btrim(a.place_label), '') = '') as activities_missing_place_label
from activities a
left join places p on p.id = a.place_id;
```

## 4. Discovery RPC spot-check
```sql
select
  id,
  name,
  place_id,
  place_label,
  lat_out,
  lng_out,
  distance_m
from public.activities_nearby(44.4327, 26.0493, 2000, null, null, 10)
order by distance_m
limit 10;
```
Confirm each row reports a non-empty `place_label`; if not, re-run the fallback hydrator or inspect the upstream activity rows.

## 5. Cache freshness per tile
```sql
select
  geohash6,
  jsonb_object_keys(discovery_cache) as cache_key,
  (discovery_cache -> jsonb_object_keys(discovery_cache) ->> 'expiresAt')::timestamptz as expires_at
from place_tiles
where discovery_cache is not null
order by expires_at asc
limit 50;
```
Look for expired entries (expiry in the past) and purge them if the list grows.
```}