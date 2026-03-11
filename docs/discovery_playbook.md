# Discovery Playbook

## Objective

Ensure discovery remains inventory-first and returns dense, filter-relevant places in:

- Hanoi (VN)
- Bangkok (TH)
- Da Nang (VN)

Even with zero user-generated events.

## Non-Negotiables

- No fake events or hardcoded discovery items.
- Provider-backed canonical inventory only (`places`, `place_sources`, `venue_activities`).
- Explain mode must expose audit counters and drop reasons.

## Explain Mode Contract

Use `explain=1` on discovery endpoints.

Required explain/debug fields:

- `providerCounts`
- `pagesFetched`
- `nextPageTokensUsed`
- `itemsBeforeDedupe`
- `itemsAfterDedupe`
- `itemsAfterGates`
- `itemsAfterFilters`
- `cacheHit`
- `cacheKey`
- `tilesTouched`
- `dropReasons`

Endpoints:

- `/api/nearby?...&explain=1`
- `/api/discovery/activities?...&explain=1`
- `/api/places?...&explain=1`

## City Seeding Flow

1. Seed each city with deterministic `packVersion`.
2. Validate tile coverage and provider counts.
3. Run inference matcher to populate `venue_activities`.
4. Verify filters (climbing, bouldering, padel, running, chess, yoga).

Important:

- The matcher is also the canonical cleanup path for stale `venue_activities`.
- Do not rely on UI suppression or ranking penalties to hide bad hospitality-era mappings; rerun the matcher so invalid rows are deleted.

## Seeding Commands

```bash
pnpm seed:city --city=hanoi --packs=all --mode=full --maxTiles=120 --refresh=1 --packVersion=2026-03-04.v1
pnpm seed:city --city=bangkok --packs=all --mode=full --maxTiles=140 --refresh=1 --packVersion=2026-03-04.v1
pnpm seed:city --city=danang --packs=all --mode=full --maxTiles=90 --refresh=1 --packVersion=2026-03-04.v1
```

## Validation Commands

```bash
pnpm verify:no-hardcoded-discovery
pnpm verify:discovery-contract
pnpm verify:seed-health --city=hanoi --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=bangkok --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=danang --packVersion=2026-03-04.v1
pnpm inventory:rematch --city=hanoi
pnpm inventory:audit:city --city=hanoi --strict
pnpm inventory:audit:city --city=bangkok --strict
pnpm inventory:audit:city --city=danang --strict
```

For launch review, use [launch_city_inventory_checklist.md](/Users/danielbisceanu/doWhat/docs/launch_city_inventory_checklist.md) after `verify:seed-health` and `inventory:rematch`.

## API Smoke Checks

Hanoi climbing:

```bash
curl -s "http://localhost:3002/api/nearby?lat=21.0285&lng=105.8542&radius=6000&types=climbing,bouldering&limit=120&explain=1" | jq '{count, providerCounts, debug: .debug}'
```

Bangkok climbing:

```bash
curl -s "http://localhost:3002/api/nearby?lat=13.7563&lng=100.5018&radius=7000&types=climbing,bouldering&limit=120&explain=1" | jq '{count, providerCounts, debug: .debug}'
```

Da Nang climbing:

```bash
curl -s "http://localhost:3002/api/nearby?lat=16.0544&lng=108.2022&radius=7000&types=climbing,bouldering&limit=120&explain=1" | jq '{count, providerCounts, debug: .debug}'
```

Expected:

- Non-zero `count` when providers return inventory.
- Explain payload includes required counters and drop reasons.
- `providerCounts` not all zero after successful seeds.

## Regression Signals

Investigate if any occurs:

- single-category collapse (e.g., only chess appears across mixed filters),
- `itemsAfterFilters` far below `itemsAfterGates` unexpectedly,
- persistent zero `providerCounts` for seeded packs,
- empty `tilesTouched` for recent seed runs.

## Regression Triage (2026-03-05)

### Logs Reviewed

- `web-dev.log` (36,030 lines)
- `error_log.md` (198 lines)
- `mobile-web.log` (16 lines)
- `mobile-dev.log` (255 lines)
- `mobile-ios.log` (58 lines)
- `packages/shared/web-dev.tmp.log` (1 line)

### Findings

- There was no hard `200` cap in `/api/nearby` (`limit` still allows up to 2000), but initial map loads at ~2km radius produced ~200 results in Hanoi.
- The `climbing` filter regression came from strict place-activity gating: rows were dropped if `venue_activities` inference was missing, even when fallback-derived place activity types clearly matched climbing/bouldering.
- Existing logs already documented earlier fallback fragility in `/api/nearby` and confirmed this class of issue has recurred when upstream provider data/inference was sparse.

### Fixes Applied

1. Place-activity contract gate now accepts fallback activity types per place (`inference ∪ fallback`) before dropping rows.
2. `/api/nearby` now performs inventory-first auto-expansion for unfiltered map loads:
   - target at least 500 venues,
   - expand through radius buckets up to 12.5km,
   - keep filtered queries on single-step expansion for latency control.
3. Map UI now displays an explicit "Search radius auto-expanded" note when backend expansion is applied.

### Verification Snapshot

- `GET /api/nearby?...radius=2000&limit=1200&debug=1` in Hanoi now returns ~590 with:
  - `radiusExpansion.fromRadiusMeters=2000`
  - `radiusExpansion.toRadiusMeters=5000`
  - `radiusExpansion.expandedCount=590`
- `GET /api/nearby?...types=climbing&debug=1` in Hanoi now returns non-zero climbing venues (3 in current local dataset).

## Regression Triage (2026-03-06)

### New Findings

- In live runtime checks on **March 6, 2026**, `types=climbing` at `radius=2000` still returned zero in some cities because filtered expansion only took one step (`2000 -> 3200`) before stopping.
- Climbing fallback inference for `places` relied too heavily on exact keyword tokens; names like `VietClimb` were under-matched.
- UI-side generic pruning could drop valid intent matches when the signal lived in `tags`/`taxonomy_categories` instead of `activity_types`.

### Fixes Applied

1. `/api/nearby` filtered auto-expansion now iterates across buckets up to 25km (same inventory-first behavior as search augmentation), instead of a single-step expansion.
2. Place fallback activity inference now accepts stem/alias hints for activity slugs (not only exact keyword tokens), including climbing-focused stems.
3. Map search intent matching now checks `activity_types`, `tags`, and `taxonomy_categories`.
4. Near-duplicate collapse now preserves nearby rows with distinct canonical `place_id` values.

### Verification Snapshot (2026-03-06)

- `GET /api/nearby?lat=21.0285&lng=105.8542&radius=2000&types=climbing&limit=1200&debug=1`
  - `count=3`, `radiusExpansion.toRadiusMeters=10000`
- `GET /api/nearby?lat=13.7563&lng=100.5018&radius=2000&types=climbing&limit=1200&debug=1`
  - `count=7`, `radiusExpansion.toRadiusMeters=20000`
- `GET /api/nearby?lat=16.0544&lng=108.2022&radius=2000&types=climbing&limit=1200&debug=1`
  - `count=1`, `radiusExpansion.toRadiusMeters=5000`

## Competitor Parity Notes

- Reclub markets city+sport-first discovery ("Pick your city + sport") which is inventory-first behavior:  
  https://play.google.com/store/apps/details?hl=en&id=co.reclub
- Pickleheads exposes a large global court directory and community contribution flows ("All the pickleball courts in the world", plus "Add a Location"/"Add a Court"):  
  https://www.pickleheads.com/  
  https://www.pickleheads.com/courts
- OSM tagging supports sports-specific venue indexing through `leisure=pitch` + `sport=*`, which is aligned with our inference and provider merge strategy:  
  https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpitch

## Provider Implementation References

- Google Places pagination constraints (`next_page_token`/`pagetoken`, delay before token becomes valid):  
  https://developers.google.com/maps/documentation/places/web-service/legacy/search-nearby
- Overpass query patterns with bbox/union/nwr examples for robust OSM harvesting:  
  https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_API_by_Example
