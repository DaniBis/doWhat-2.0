# City Seeding (Inventory-First, Provider-Backed)

This project seeds canonical venue inventory from external providers into:

- `places`
- `place_sources`
- `place_tiles`
- `place_request_metrics`
- `venue_activities`

No hardcoded discovery items are used in production discovery responses.

## Goals

- Dense venue/activity coverage for Hanoi, Bangkok, and Da Nang.
- Deterministic reruns tied to `(city, geohash6 tile, packVersion)`.
- Auditable explain metadata for each tile+pack run.

## Prerequisites

```bash
export CRON_BASE_URL="http://localhost:3002"
export CRON_SECRET="..."
export NEXT_PUBLIC_SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export GOOGLE_PLACES_API_KEY="..."
# optional
export FOURSQUARE_API_KEY="..."
export OVERPASS_API_URL="https://overpass-api.de/api/interpreter"
export SEED_PACK_VERSION="2026-03-04.v1"
```

Start web app (cron route runs inside app server):

```bash
pnpm dev:web
```

## Core CLI

```bash
pnpm seed:city --city=hanoi --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=120 --refresh=1 --packVersion=2026-03-04.v1 --timeoutMinutes=120
pnpm seed:city --city=bangkok --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=120 --refresh=1 --packVersion=2026-03-04.v1 --timeoutMinutes=120
pnpm seed:city --city=danang --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=90 --refresh=1 --packVersion=2026-03-04.v1 --timeoutMinutes=120
```

Additional packs are available:

- `padel`
- `running`
- `yoga`
- `chess`
- `all` (all packs)

Example full pack run:

```bash
pnpm seed:city --city=bangkok --packs=all --mode=full --maxTiles=140 --refresh=1 --packVersion=2026-03-04.v1 --timeoutMinutes=120
```

Incremental refresh (cache-respecting):

```bash
pnpm seed:city --city=hanoi --packs=parks_sports,climbing_bouldering --mode=incremental --maxTiles=100 --refresh=0 --packVersion=2026-03-04.v1 --timeoutMinutes=60
```

`seed:city` now supports `--timeoutMinutes=<n>` (or env `SEED_CITY_TIMEOUT_MINUTES`) to prevent long synchronous cron calls from failing at the client layer.

## Convenience Commands

```bash
pnpm seed:places:hanoi
pnpm seed:places:bangkok
pnpm seed:places:danang
```

These currently run:

- `packs=parks_sports,climbing_bouldering`
- `refresh=1`
- `precision=6`

Important:

- seed packs are activity-first and must not be widened with hospitality-first keywords unless there is a deliberate product exception backed by real activity-host evidence.
- after major inventory or policy changes, rerun the canonical activity matcher so stale `venue_activities` rows are deleted instead of lingering in remote inventory.

## Explain Output (Seed Summary)

`seed:city` returns rollups including:

- `providerCounts`
- `pagesFetched`
- `nextPageTokensUsed`
- `itemsBeforeDedupe`
- `itemsAfterDedupe`
- `itemsAfterGates`
- `itemsAfterFilters`
- `cacheHits`
- `cacheKeys`
- `tilesTouched`
- `dropReasons`

Each tile row also includes per-pack explain counters and drop reasons.

## Auditing Seed Signatures

Each tile+pack write stores `discovery_cache` entry in `place_tiles` using deterministic keys:

```text
seed:<packVersion>:<city>:<geohash6>:<pack>:<signatureHash>
```

This binds runs to `(city, tile, packVersion)` and supports repeatable reruns.

## Validation SQL

```sql
-- Tiles touched recently for each city
select geohash6, refreshed_at, provider_counts
from public.place_tiles
where refreshed_at > now() - interval '48 hours'
order by refreshed_at desc
limit 200;
```

```sql
-- Audit seed cache keys and explain payloads
select
  geohash6,
  jsonb_object_keys(discovery_cache) as cache_key,
  discovery_cache -> jsonb_object_keys(discovery_cache) -> 'providerCounts' as provider_counts,
  discovery_cache -> jsonb_object_keys(discovery_cache) -> 'explain' -> 'dropReasons' as drop_reasons
from public.place_tiles
where discovery_cache is not null
  and discovery_cache <> '{}'::jsonb
limit 200;
```

```sql
-- Canonical places per city
select city, count(*) as places_count
from public.places
where city ilike any(array['%hanoi%','%bangkok%','%da nang%'])
group by city
order by places_count desc;
```

```sql
-- Inferred venue activities coverage
select ac.slug, count(*) as venue_matches
from public.venue_activities va
join public.activity_catalog ac on ac.id = va.activity_id
group by ac.slug
order by venue_matches desc
limit 50;
```

## Automated Health Checks

```bash
pnpm verify:no-hardcoded-discovery
pnpm verify:discovery-contract
pnpm verify:seed-health --city=hanoi --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=bangkok --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=danang --packVersion=2026-03-04.v1
```

`verify:seed-health` fails when:

- no recently touched tiles exist for the city+packVersion,
- required packs are missing,
- provider counts are zero.

## Activity Rematch / Cleanup

Use the canonical matcher to audit and clean stale `venue_activities` rows after seeding or policy changes:

```bash
pnpm inventory:rematch --city=hanoi
pnpm inventory:rematch --city=bangkok
pnpm inventory:rematch --city=danang
```

Apply changes:

```bash
pnpm inventory:rematch --city=hanoi --apply
```

The rematch summary now exposes:

- `deletes`
- `hospitalityKeywordDeletes`
- `eventEvidenceProtectedMatches`

## Runtime Discovery Regression Checks (Map)

Use these checks when users report low map density or empty climbing search:

```bash
# Baseline inventory density (should auto-expand if sparse)
curl -s "http://localhost:3002/api/nearby?lat=21.043154527936547&lng=105.84353128784457&radius=2000&limit=1200&debug=1" \
  | jq '{count, radiusMeters, radiusExpansion, providerCounts, candidateCounts: .debug.candidateCounts, dropped: .debug.dropped}'

# Climbing filter in Hanoi (must be non-zero when provider/place data exists)
curl -s "http://localhost:3002/api/nearby?lat=21.0285&lng=105.8542&radius=12500&limit=1200&types=climbing&debug=1" \
  | jq '{count, radiusMeters, providerCounts, candidateCounts: .debug.candidateCounts, dropped: .debug.dropped}'

# Small-radius climbing request should auto-expand (inventory-first) instead of returning empty
curl -s "http://localhost:3002/api/nearby?lat=13.7563&lng=100.5018&radius=2000&limit=1200&types=climbing&debug=1" \
  | jq '{count, radiusMeters, radiusExpansion, providerCounts, candidateCounts: .debug.candidateCounts}'
```

Expected:

- Unfiltered sparse load should include `radiusExpansion` and increase count.
- Climbing query should not collapse to zero solely due missing inference rows when fallback place signals match.
- Filtered requests may widen radius up to 25km to recover sparse sport-specific supply.
