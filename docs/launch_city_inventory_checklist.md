# Launch City Inventory Checklist

This checklist makes inventory review deterministic for the current launch cities:

- Hanoi
- Da Nang
- Bangkok

Use it after seeding, after `venue_activities` cleanup, and before any launch readiness sign-off.

For the exact live command sequence and artifact naming convention, use [live_inventory_execution_pack.md](/Users/danielbisceanu/doWhat/docs/live_inventory_execution_pack.md).

## What This Validates

- obvious hospitality pollution
- weak or stale `venue_activities` mappings
- duplicate place clusters
- activity coverage for seeded high-signal categories
- session-to-mapping gaps
- manual override visibility
- hospitality exceptions that still need manual review

This does **not** prove full market completeness. It proves that the current repo baseline can be audited consistently.

## Required Commands

Run these from a DB-connected environment:

```bash
pnpm inventory:diagnose:city --city=hanoi --format=json --output="$INVENTORY_ARTIFACT_DIR/hanoi-diagnostics.json"
pnpm inventory:diagnose:city --city=danang --format=json --output="$INVENTORY_ARTIFACT_DIR/danang-diagnostics.json"
pnpm inventory:diagnose:city --city=bangkok --format=json --output="$INVENTORY_ARTIFACT_DIR/bangkok-diagnostics.json"
```

Interpret the diagnostics before trusting a small rematch count:

- `scope.currentScopeCount` vs `scope.bboxPlaceCount`
- `scope.legacyStringScopeCount`
- `scope.normalizedScopeCount`
- `scope.nullCityFieldsCount`
- `inventory.mappedCount` vs `inventory.activityEligibleCount`
- `seed.cacheEntries`

```bash
pnpm verify:seed-health --city=hanoi --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=danang --packVersion=2026-03-04.v1
pnpm verify:seed-health --city=bangkok --packVersion=2026-03-04.v1
```

Dry-run mapping cleanup:

```bash
pnpm inventory:rematch --city=hanoi --all --batchSize=500
pnpm inventory:rematch --city=danang --all --batchSize=500
pnpm inventory:rematch --city=bangkok --all --batchSize=500
```

Apply cleanup when the dry-run shows stale or hospitality keyword deletions:

```bash
pnpm inventory:rematch --city=hanoi --apply --all --batchSize=500
pnpm inventory:rematch --city=danang --apply --all --batchSize=500
pnpm inventory:rematch --city=bangkok --apply --all --batchSize=500
```

Run the deterministic city audit:

```bash
pnpm inventory:audit:city --city=hanoi --strict
pnpm inventory:audit:city --city=danang --strict
pnpm inventory:audit:city --city=bangkok --strict
```

To save machine-readable reports:

```bash
pnpm inventory:diagnose:cities --format=json --output=launch-city-inventory-diagnostics.json
pnpm inventory:audit:cities --format=json --output=launch-city-inventory-audit.json
```

To summarize the captured rematch + audit artifacts into a launch recommendation:

```bash
pnpm inventory:status --dir="$INVENTORY_ARTIFACT_DIR" --all --format=markdown --output="$INVENTORY_ARTIFACT_DIR/live-inventory-status.md"
```

## City Coverage Standards

These are launch-review minima, not claims of market saturation.

### Hanoi

Required coverage:

- climbing: at least 2 places
- bouldering: at least 1 place
- yoga: at least 2 places
- running: at least 2 places

Review-only coverage:

- chess: at least 1 place

### Da Nang

Required coverage:

- climbing: at least 1 place
- bouldering: at least 1 place
- yoga: at least 1 place
- running: at least 1 place
- padel: at least 1 place

Review-only coverage:

- chess: at least 1 place

### Bangkok

Required coverage:

- climbing: at least 3 places
- bouldering: at least 2 places
- yoga: at least 2 places
- running: at least 2 places
- padel: at least 2 places

Review-only coverage:

- chess: at least 1 place

## Audit Status Meaning

`acceptable`
- no obvious hospitality leakage
- no failing coverage gaps
- no major duplicate or stale-mapping clusters

`suspicious`
- something needs manual review before launch
- examples: review-only category missing, one or two hospitality leaks, a few duplicate clusters, a few session-to-mapping gaps

`failing`
- launch inventory is not trustworthy enough for that city
- examples: required activity coverage missing, widespread stale keyword mappings, repeated hospitality leakage, or repeated duplicate clusters

With `--strict`, any city that is not `acceptable` returns a non-zero exit code.

## What The Audit Checks

The audit script reports:

- `hospitalityLeakage`
  - hospitality-primary places with keyword-only activity mappings and no manual/session support
- `weakMappings`
  - keyword-only mappings without activity-category, manual-override, or session evidence support
- `staleMappings`
  - weak keyword mappings older than 120 days
- `duplicateClusters`
  - same-name places within 120m
- `providerDisagreements`
  - hospitality-primary provider profiles kept alive only through manual/session-backed exceptions
- `sessionMappingGaps`
  - places with session evidence for an activity but no corresponding `venue_activities` row
- `manualOverrides`
  - explicit override-backed inventory that must remain visible in review

## Manual Review Checklist

For each city:

1. Inspect every `hospitalityLeakage` sample.
   - If it is truly wrong, rerun `pnpm inventory:rematch --city=<slug> --apply`.
   - If it is a legitimate exception, add a manual override or confirm the session evidence path.

2. Inspect the diagnostics scope counts.
   - `currentScopeCount` should now track the bbox-aware matcher scope.
   - If `legacyStringScopeCount` is tiny while `currentScopeCount` is large, the repo fix is working and the remaining issue is persisted city/locality hygiene rather than operator scope.
   - If `currentScopeCount` is still tiny but `bboxPlaceCount` is large, stop and investigate a real scope regression before trusting rematch output.

3. Inspect every `sessionMappingGaps` sample.
   - If the place hosts real sessions, the activity matcher or override layer must be corrected.

4. Inspect every `duplicateClusters` sample.
   - Merge/canonicalize duplicates if they represent the same real place.
   - Leave them alone only if the cluster is actually multiple distinct places.

5. Inspect every missing required activity category.
   - Re-check seeding coverage and provider fetches.
   - If the city truly lacks the activity, document that explicitly before launch.

6. Inspect every `providerDisagreements` sample.
   - These are allowed exceptions, not automatic failures.
   - Confirm the manual/session evidence is still real.

## Known Blind Spots

- The audit cannot prove that real-world coverage is complete.
- Imported external events are not used as canonical activity-mapping evidence here.
- The audit depends on live DB access and current seed/rematch freshness.
- A city can still pass the automated checks and need final human review for local market nuance.

## Rerun Rules

Rerun the full checklist after:

- changing seed packs
- changing activity matching policy
- bulk reseeding a target city
- applying manual overrides
- running `inventory:rematch --apply`
