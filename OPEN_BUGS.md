# doWhat Open Bugs

Ranked bug register as of **2026-03-10**.

Only list issues that are still open, operationally unresolved, or not yet proven closed.

## Critical

- No critical open bugs are currently proven after the attendance/hosting truth hardening pass. Reclassify immediately if live verification contradicts this.

## High

### 1. There is still no standalone first-party event attendance model

- Surface/page/system
  - Imported/open event detail, any future user-created non-session event flow
- Symptom
  - Session-backed participation truth is now explicit, but doWhat still does not own attendance for standalone/open events as a first-party product capability.
- Likely root cause
  - The product model still treats first-party hosted participation as `sessions`, while `events` remain a mixed surface of imported listings and session-backed mirrors.
- Current status
  - Open / explicit limitation
- Owner
  - Codex
- Blocking or non-blocking
  - Blocking for a broader standalone-events product, but not for current session truth
- Recommended next action
  - Keep attendance explicit as unavailable/source-owned on event surfaces until a real standalone event participation model exists.
- Related files/tests if known
  - `apps/doWhat-web/src/app/events/[id]/page.tsx`
  - `apps/doWhat-web/src/app/api/events/route.ts`
  - `apps/doWhat-web/src/app/api/events/[id]/route.ts`
  - `packages/shared/src/events/truth.ts`

### 2. Event discovery still uses a narrower explicit subset than the full shared discovery contract

- Surface/page/system
  - `/api/events`, web map events rail, any consumer using event-only filtering
- Symptom
  - `/api/events` now enforces an explicit supported subset, but it still does not offer full parity with place/activity discovery.
- Likely root cause
  - Event discovery was hardened incrementally and still carries separate parameter semantics.
- Current status
  - Open / partially mitigated
- Owner
  - Codex
- Blocking or non-blocking
  - Blocking for final filter parity
- Recommended next action
  - Keep the subset stable, then resolve the broader event/session truth pass before attempting full filter parity.
- Related files/tests if known
  - `apps/doWhat-web/src/app/api/events/route.ts`
  - `packages/shared/src/discovery/filters.ts`
  - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`

### 3. Target-city inventory still needs live rematch + audit execution

- Surface/page/system
  - Remote discovery inventory quality for Hanoi, Da Nang, and Bangkok
- Symptom
  - Even though the code now enforces an activity-first boundary and the repo can audit target cities deterministically, the actual live city inventory may still contain stale keyword-era mappings, duplicate clusters, or missing launch categories until the connected-environment rematch/audit is run.
- Likely root cause
  - Existing rows were created before the latest hospitality suppression and matching safeguards, and the new target-city audit workflow has not yet been executed against the live environment.
- Current status
  - Open / repo-side cleanup path and city audit tooling now exist, remote execution still pending
- Owner
  - manual
- Blocking or non-blocking
  - Blocking for production discovery trust
- Recommended next action
  - Run `pnpm inventory:rematch --city=<slug> --apply`, then `pnpm inventory:audit:city --city=<slug> --strict` for Hanoi, Da Nang, and Bangkok, and complete the manual review checklist in `docs/launch_city_inventory_checklist.md`.
- Related files/tests if known
  - `apps/doWhat-web/src/lib/places/activityMatching.ts`
  - `apps/doWhat-web/src/lib/seed/citySeeding.ts`
  - `scripts/rematch-venue-activities.mjs`
  - `scripts/city-inventory-audit.mjs`
  - `docs/inventory_truth_policy.md`
  - `docs/launch_city_inventory_checklist.md`
  - `packages/shared/src/discovery/activityBoundary.ts`
  - `apps/doWhat-web/src/lib/discovery/__tests__/placeActivityFilter.test.ts`

## Medium

### 4. Some secondary discovery surfaces may still carry older mixed event/session wording

- Surface/page/system
  - secondary discovery/supporting surfaces outside the primary web/mobile map flows
- Symptom
  - The primary web/mobile map discovery surfaces now distinguish doWhat sessions, imported events, and activity/place results explicitly, but untouched secondary screens may still use older generic “event” wording until they are swept.
- Likely root cause
  - Truth hardening focused on the highest-traffic create/detail/map paths first, so some secondary entry points were left for a later sweep.
- Current status
  - Open / narrowed
- Owner
  - Codex
- Blocking or non-blocking
  - Non-blocking
- Recommended next action
  - Sweep remaining secondary discovery/supporting screens only when they are actively touched for product work; do not reopen the primary mixed discovery contract unless a regression proves it necessary.
- Related files/tests if known
  - `apps/doWhat-web/src/app/discover/page.tsx`
  - `apps/doWhat-web/src/app/venues/page.tsx`
  - `apps/doWhat-mobile/src/app/home.tsx`
  - `apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx`
  - `apps/doWhat-mobile/src/app/__tests__/map-filter-surface.test.ts`

### 5. Some secondary surfaces may still use older filter or session-copy language

- Surface/page/system
  - secondary discovery/supporting surfaces outside the primary web/mobile map flows
- Symptom
  - The primary map filter UX is now activity-first and contract-backed, but untouched secondary screens may still carry older “event” or generic filter wording until they are explicitly swept.
- Likely root cause
  - Truth hardening and final filter UX work focused on the highest-traffic map surfaces first.
- Current status
  - Open / narrowed
- Owner
  - Codex
- Blocking or non-blocking
  - Non-blocking
- Recommended next action
  - Sweep remaining secondary entry points only when they are actively touched for product work; do not reopen the primary map filter architecture.
- Related files/tests if known
  - `apps/doWhat-web/src/app/venues/page.tsx`
  - `apps/doWhat-web/src/app/discover/page.tsx`
  - `apps/doWhat-mobile/src/app/home.tsx`

### 6. Web typecheck is sensitive to `.next/types` generation order

- Surface/page/system
  - local/dev verification for `dowhat-web`
- Symptom
  - Running `typecheck` before `next build` can fail because `.next/types` has not been generated yet.
- Likely root cause
  - The repo relies on generated Next.js type artifacts.
- Current status
  - Open / known workflow constraint
- Owner
  - Codex
- Blocking or non-blocking
  - Non-blocking
- Recommended next action
  - Either document build-before-typecheck for the web app or remove the dependency if the repo later chooses to.
- Related files/tests if known
  - `apps/doWhat-web/package.json`
  - recent entries in `changes_log.md`

## Low

### 7. Some historical docs still describe obsolete repo truth

- Surface/page/system
  - root/docs planning layer
- Symptom
  - Several older docs still describe 2025 priorities or old operational failures that are no longer the main steering layer.
- Likely root cause
  - Docs accreted over multiple AI-assisted passes without a canonical control layer.
- Current status
  - Open but mitigated by the new operating-system docs
- Owner
  - manual
- Blocking or non-blocking
  - Non-blocking
- Recommended next action
  - Keep the new root operating docs canonical and archive or annotate stale docs over time.
- Related files/tests if known
  - `PROJECT_STATE.md`
  - `ENGINEERING_ROADMAP_2025.md`
  - `docs/current_app_overview_2025-12-03.md`
