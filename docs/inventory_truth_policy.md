# Inventory Truth Policy

This document defines what inventory is allowed to power doWhat discovery and how stale place-activity mappings must be cleaned up.

## Product Boundary

doWhat is activity-first.

Valid inventory targets:

- sports venues
- activity studios
- hobby and workshop spaces
- community meetup hosts
- neutral/open/private spaces tied to real sessions or events

Inventory that must be excluded by default:

- restaurants
- bars
- pubs
- nightlife venues
- generic cafes / coffee shops
- other hospitality-first venues with no real activity-host evidence

## Canonical Inventory Sources

Primary truth layers, in order:

1. `activity_manual_overrides`
2. real `sessions` tied to canonical `places`
3. real `events` tied to canonical `places`
4. `venue_activities` rows backed by structured source/category evidence
5. `venue_activities` rows backed by allowed keyword evidence
6. raw provider categories/tags on `places` / `place_sources`

Important constraints:

- `places` is the canonical place model.
- `venue_activities` is the persisted activity mapping layer for canonical places.
- `venue_activity_votes` still live on legacy `venues`; they can inform legacy search, but they are not yet canonical place truth.

## Activity Mapping Policy

`venue_activities` rows are allowed when one of these is true:

1. manual override exists
2. structured provider category match exists
3. activity-specific session evidence exists for the same canonical place
4. keyword evidence exists on a non-hospitality-primary place
5. keyword evidence exists on a hospitality-primary place **and** there is activity-specific session evidence for that same activity

`venue_activities` rows must be deleted when all of these are true:

- source is weak/stale for the current policy
- no manual override exists
- no structured category evidence exists
- no activity-specific session evidence exists
- the place is hospitality-first or otherwise no longer supports the activity under the current matcher

## Hospitality / Noise Blocking

Hospitality-first inventory must not survive on weak keyword signal alone.

Examples of blocked-by-default signals:

- `cafe`
- `coffee`
- `restaurant`
- `bar`
- `pub`
- `nightlife`
- other eat/drink-only variants

Allowed exception paths:

- manual override
- structured provider category evidence
- activity-specific session evidence at the same canonical place

## Seeding Policy

City seeding packs should target activity-oriented supply, not hospitality browsing.

Current guardrail:

- the chess seed pack targets clubs and community boards, not “cafe chess” vocabulary

If a new seed keyword would primarily widen hospitality noise, do not add it.

## Cleanup / Rematch Flow

Use the canonical matcher to audit and clean stale `venue_activities` rows.

Dry run:

```bash
pnpm inventory:rematch --city=hanoi --all --batchSize=500
pnpm inventory:rematch --city=bangkok --all --batchSize=500
pnpm inventory:rematch --city=danang --all --batchSize=500
```

Apply:

```bash
pnpm inventory:rematch --city=hanoi --apply --all --batchSize=500
pnpm inventory:rematch --city=bangkok --apply --all --batchSize=500
pnpm inventory:rematch --city=danang --apply --all --batchSize=500
```

Targeted place cleanup:

```bash
pnpm inventory:rematch --placeId=<canonical-place-uuid> --apply
```

What to inspect in the output:

- `deletes`
- `hospitalityKeywordDeletes`
- `eventEvidenceProtectedMatches`
- `errors`

Interpretation:

- `hospitalityKeywordDeletes > 0` means stale hospitality-era keyword mappings were removed
- `eventEvidenceProtectedMatches > 0` means the matcher kept hospitality exceptions only because the same place already has activity-specific session evidence

## Target City Validation

After rematch cleanup, run the city inventory audit for Hanoi, Da Nang, and Bangkok:

```bash
pnpm inventory:audit:city --city=hanoi --strict
pnpm inventory:audit:city --city=danang --strict
pnpm inventory:audit:city --city=bangkok --strict
```

Use [launch_city_inventory_checklist.md](/Users/danielbisceanu/doWhat/docs/launch_city_inventory_checklist.md) for:

- city-specific coverage minima
- acceptable / suspicious / failing interpretation
- manual review rules for hospitality exceptions, duplicates, and session-to-mapping gaps

Use [live_inventory_execution_pack.md](/Users/danielbisceanu/doWhat/docs/live_inventory_execution_pack.md) for the exact live command sequence, artifact naming, and final city status reporting flow.

## Remaining Known Limits

- Imported external events are not yet used as activity-specific mapping evidence in `venue_activities`; first-party sessions are the current deterministic evidence path.
- Legacy `venue_activity_votes` are still attached to `venues`, not canonical `places`.
- Remote cleanup still requires a machine that can reach the live environment and run the rematch command against the web cron route.
