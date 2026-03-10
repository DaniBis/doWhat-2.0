# doWhat Discovery Truth

This file defines how discovery is supposed to work.

If code, filters, ranking, or seeding behavior conflicts with this file, that conflict must be called out explicitly.

## Product Boundary

doWhat is an **activity-first** app.

doWhat should discover:

- indoor and outdoor activities
- sports venues with real activity relevance
- hobbies and workshops
- community meetups
- social sessions
- user-created events
- neutral/open/private spaces used for real activities or social gatherings

doWhat is **not** a generic eat/drink/nightlife discovery app.

doWhat must not surface restaurants, cafes, bars, pubs, nightlife, or food/drink-first venues as primary discovery results unless there is strong activity-host evidence.

## Canonical Models

- **Places**
  - Canonical place model for discovery.
  - Backed by provider data and place metadata.
- **Place sources**
  - Provenance for where place data came from.
- **Venue activities**
  - Evidence layer connecting a place/venue to an activity.
- **Venues**
  - Legacy compatibility model.
  - May still appear in fallback paths, but not as the long-term canonical truth.
- **Sessions**
  - Real scheduled community/hosted occurrences.
  - Current user-authored creation writes `sessions`, not standalone `events`.
  - Place-backed sessions should preserve canonical `place_id`.
  - Hydrated/API session payloads may expose `placeLabel: null` when the session is flexible or only has an internal placeholder label.
- **Events**
  - Ingested or external events.
  - User-facing event discovery currently combines `events` and `sessions`.
  - Event payloads should explicitly expose:
    - `origin_kind`
    - `location_kind`
    - `is_place_backed`

## What Makes a Place Eligible

A place is eligible for primary discovery when at least one of the following is true:

1. it is an activity-supporting venue by category/taxonomy
2. it has confirmed venue-activity mappings
3. it has a manual override confirming activity relevance
4. it has real events or sessions tied to it
5. it is a neutral/open/private location used for user-created events

A place should be excluded by default when all of the following are true:

- it is primarily restaurant/cafe/bar/pub/nightlife/food/drink
- it has no activity evidence
- it has no real event/session support
- it has no manual override or strong structured source evidence

## Evidence Hierarchy

Current activity-host evidence should be treated in this order:

1. **manual override**
2. **real event/session evidence**
3. **confirmed non-keyword venue-activity mapping**
4. **strong structured source evidence**
5. **activity-supporting category evidence**
6. **weak keyword-only signal**

Important rule:

- Hospitality-first places must not survive on weak keyword-only signal alone.

## Event / Session / Place Truth Rules

- User-authored doWhat creation currently means **session creation**.
- `places` are the canonical place truth.
- `venues` remain legacy compatibility/fallback only.
- `sessions.place_id` must represent canonical place truth only.
- `sessions.place_label` may still store an internal fallback value to satisfy the legacy DB constraint, but clients must not treat that fallback as a real place label.
- `events.place_id` must represent canonical place truth only and must never be populated with a legacy `venueId`.
- Flexible or unpinned listings must stay explicit instead of being normalized into fake venue labels.
- Coordinate-backed custom locations without a real label should stay explicit and render as a pinned meetup point, not a fake venue name.

## Source-of-Truth Hierarchy

For showing a place/activity relationship:

1. manual/admin confirmation
2. real scheduled sessions or events tied to the place
3. canonical place metadata plus structured activity mapping
4. provider/source category alignment
5. fallback inference

Fallback inference is allowed, but it must be visible in code, testable, and weaker than confirmed evidence.

## Dedupe Rules

- User-facing discovery should not show the same real place multiple times just because multiple provider rows or legacy ids exist.
- Canonical place identity wins over raw provider ids.
- Distinct nearby places must not be collapsed just because they share similar names.
- User-facing event results should dedupe session-origin items by session identity.

## Trust / Verification Semantics

- `all`
  - include all eligible discovery results
- `verified_only`
  - include only verified or strongly confirmed results
- `ai_only`
  - include only AI/suggestion-first rows where that mode is intentionally exposed

Trust mode is a product behavior, not a cosmetic chip.

## Ranking Principles

Primary ranking inputs should prefer:

- strong activity evidence
- real event/session history
- manual confirmation
- source confidence
- taxonomy/category alignment
- quality/popularity signals
- distance as a meaningful but not sole factor

Discovery should penalize or exclude places whose only relevance is hospitality.

## Fallback Behavior

Allowed fallback behavior today:

- radius expansion for discovery when inventory is sparse
- compatibility reads from legacy `venues` where necessary
- provider/source fallback when primary inventory is weak

Rules for fallback behavior:

- it must not silently change product meaning
- it must not bypass activity-first eligibility
- it must not create duplicate places
- it must not invent fake events or fake hosts

## What Must Never Be Shown

- generic restaurants/cafes/bars/nightlife venues with no activity evidence
- fake events
- fake session counts
- placeholder filter states that imply unsupported functionality
- duplicate canonical places presented as separate discovery results
- UI states that claim a filter/ranking rule that is not actually applied

## Current Discovery Pipeline Summary

Current repo direction:

1. geo scope
2. result kind
3. activity/taxonomy matching
4. text search
5. trust filters
6. people filters where supported
7. code-driven ranking
8. dedupe

Important current realities:

- `places` is canonical, but compatibility logic still touches `venues`
- discovery ranking/trust/dedupe remain mostly code-driven
- web/mobile parity is improved but still needs continued verification
- filter contract is much healthier than it was, and event discovery now has an explicit supported subset instead of a silent route-specific drift point
- touched create/detail surfaces now treat user-authored creation as session creation instead of pretending it writes standalone `events`
- primary web/mobile map filters now expose only supported activity-first controls; placeholder and weak price/group/time sections are no longer shown there

## Desired Discovery Pipeline Summary

The desired steady-state pipeline is:

1. canonical place scope
2. explicit result kind
3. validated activity/taxonomy filters
4. text search combined deterministically with structured filters
5. trust filters
6. people filters only when schema-backed
7. explicit sort/ranking mode
8. deterministic dedupe

The product should be able to explain why a result appeared and why a result was filtered out.

## Known Current Deviations

- `/api/events` still does not fully use the same shared filter contract as place/activity discovery; it now enforces a documented subset instead.
- Some older remote `venue_activities` rows may still reflect pre-boundary matching rules until rematch/cleanup is run.
- Attendance / hosting truth is not yet closed as a product system even though create/detail/API place semantics are now much clearer.

## Next Implementation Priorities

1. Complete the remaining attendance / hosting truth work on top of the hardened event/session/place semantics.
2. Audit and clean stale remote activity mappings if needed.
3. Decide whether `/api/events` should expand beyond its current explicit subset once mixed event/session truth is stable.
4. Sweep any untouched secondary surfaces only when they are actively modified so they inherit the same activity-first and session-truth copy.
