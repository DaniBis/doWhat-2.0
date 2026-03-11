# doWhat Current State

This file is the brutally honest snapshot of the repo as of **2026-03-10**.

Use this file, not old 2025 planning snapshots, when deciding what to work on next.

## Product Surfaces

- **Web discovery**
  - `/map`
  - `/places`
  - `/discover`
  - `/filter`
  - `/search`
  - `/venues`
- **Web creation / hosting**
  - `/create`
  - `/sessions/[id]`
  - `/api/sessions`
  - `/api/events`
- **Mobile discovery**
  - tabs: home, map, saved, profile
  - standalone filter and people-filter screens
- **Ops / admin / scripts**
  - `/admin/*`
  - `pnpm health`
  - `pnpm verify:dowhat`
  - `node scripts/health-migrations.mjs --dowhat`
  - discovery verification scripts and post-deploy SQL packs

## Working Areas

- **Shared discovery filter contract exists**
  - `packages/shared/src/discovery/filters.ts` is now the normalized contract for discovery filters.
- **Activity-first discovery boundary is implemented**
  - doWhat now suppresses hospitality-first places unless they have strong activity evidence.
- **Canonical place direction is clear**
  - `places` is the intended canonical place model.
- **Event/session/place truth is materially better on the touched surfaces**
  - user-authored creation is now explicitly a session flow
  - session hydration now distinguishes canonical place, legacy venue, custom location, and flexible location states
  - flexible and unlabeled custom states no longer surface fake printable place labels in hydrated/API payloads
  - event payloads expose `origin_kind`, `location_kind`, and `is_place_backed`
  - session PATCH now re-derives `place_id` and `place_label` together when location truth changes
  - mobile create/session detail use the web session API truth path first
- **Discovery and filter regression coverage is much stronger than before**
  - recent passes added focused shared/web/mobile tests and verification scripts.
- **Primary discovery filter UX is now honest on the touched map surfaces**
  - web `/map` now shows search, result kind, activity focus, result strictness, and trait filters only when backed by real facets
  - mobile map now shows search, activity categories, distance, and result strictness only
  - web/mobile `/filter` routes are now explicitly saved activity-preference screens, not live map-filter drawers
- **Migration health tooling is better**
  - the repo now loudly detects discovery-critical migration drift instead of silently assuming schema health.
- **Logo handling and duplicate suppression improved**
  - recent passes hardened place logos and duplicate-place behavior.

## Fragile Areas

- **Event discovery is still a mixed model**
  - user-facing event results still combine `events` and `sessions`.
- **Standalone user-event creation is still not a separate product capability**
  - current user-authored creation truth is session creation, while `events` remain ingested/session-derived read models.
- **`/api/events` only supports an explicit subset of the canonical discovery filter contract**
  - event filtering is no longer silently divergent, but it is still narrower than place/activity discovery filtering.
- **Legacy venue compatibility still exists**
  - discovery still has compatibility/fallback logic that touches `venues`, even though `places` is the canonical direction.
- **Secondary surfaces still need periodic truth sweeps**
  - the main map flows are in better shape, but some secondary screens may still carry older copy or narrower semantics until they are explicitly touched.

## Known Contradictions

- Old root docs describe a 2025 product posture that no longer matches the current 2026 discovery/filter work.
- The repo direction says `places` is canonical, but some live code still carries `venues` compatibility and fallback behavior.
- The repo has a shared discovery filter contract, but event discovery still uses a narrower explicit subset rather than full parity.
- Activity-first discovery is now enforced in code, but some remote data may still include older hospitality-derived `venue_activities` rows until cleanup/rematch is run.

## Data / Discovery Truth Gaps

- There is still no final operational answer to whether stale remote `venue_activities` rows need cleanup, rematch, or both.
- Event/session/place truth is much clearer on the touched create/detail/API surfaces, attendance/hosting truth is explicit on the main session/event detail paths, and mixed discovery truth is now explicit on the primary web/mobile map surfaces. Remaining risk is mostly in untouched secondary surfaces and legacy remote data, not the main mixed map contract.
- The product now knows what it should discover, but real-user readiness in target cities still depends on actual remote inventory quality.

## Test / Verification State

- **Good**
  - Shared discovery/filter tests exist.
  - Focused web/mobile discovery parity tests exist.
  - Discovery contract verification scripts exist.
  - Migration health tooling exists.
- **Not good enough yet**
  - Live browser/simulator smoke verification was not re-run after every discovery pass.
  - Full end-to-end real-user scenarios are not yet represented as a release gate.

## Immediate Priorities

1. Audit stale remote activity mappings and clean them up if they still leak pre-boundary hospitality matches.
2. Decide whether `/api/events` should widen beyond its current explicit subset now that mixed event/session truth is explicit on the main discovery surfaces.
3. Sweep untouched secondary surfaces that still carry older event/session wording so they inherit the same explicit discovery and participation contract.
4. Build a real-user readiness gate only after discovery, filters, event truth, and reliability truth are all verified.

## What Blocks Real-Life Readiness

- remaining legacy-model overlap (`places` vs `venues`, `events` vs `sessions`)
- no separate first-party standalone event attendance model

## Operating Notes

- Treat `ROADMAP.md`, `CURRENT_STATE.md`, `OPEN_BUGS.md`, `QUALITY_GATES.md`, `DISCOVERY_TRUTH.md`, and `FILTER_CONTRACT.md` as the current control layer.
- Treat older docs like `PROJECT_STATE.md` and `ENGINEERING_ROADMAP_2025.md` as historical context, not current operating truth.
