# Changes Log

## 2026-01-08

1. **/map performance: request storm control**
   - Debounced map region updates (250ms) and normalised bounds/radius so `/api/nearby` and `/api/events` don’t refetch repeatedly for equivalent move-end payloads. Also added React Query `placeholderData` (keep previous), longer `staleTime/gcTime`, and disabled reconnect/mount refetches to reduce background churn.

2. **WebMap render performance**
   - Switched `WebMap` from a fully controlled `viewState` (rerendering on every pan/zoom frame) to an uncontrolled Mapbox view with `initialViewState` + imperative `easeTo`, keeping map interactions smooth and reducing React work during drags.

3. **Reusable debounce hook**
   - Added `useDebouncedCallback` to `apps/doWhat-web/src/lib/hooks` for consistent debounced interaction handling.

## 2026-01-07

1. **Shared theme dist rebuilt**
   - `pnpm --filter @dowhat/shared build` regenerated `packages/shared/dist/theme.js`, exposing the typography tokens that `apps/doWhat-web/tailwind.config.js` expects. This unblocked the Next.js dev server that previously crashed while reading `sharedTheme.typography.family` inside `globals.css`.

2. **Expo env parity with web**
   - Added `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_WEB_URL` to both the root `.env.local` and `apps/doWhat-mobile/.env.local` so Expo Router receives the same Supabase + web host configuration as the web client. Restarting `expo start -c` now hydrates the Supabase client instead of redboxing.

3. **Nearby venue fallback resilience**
   - `/api/nearby` now retries the venues fallback query without `updated_at` whenever Supabase reports `column venues.updated_at does not exist`, logging a warning and continuing with the degraded dataset. This keeps the Activities list populated even on older databases that have not added the column yet.

## 2026-01-06

1. **Events API resilience**
   - `/api/events` and `/api/events/[id]` now fetch related place records via a dedicated query instead of relying on Supabase’s schema cache joins. This prevents runtime errors and guarantees `place` data is attached to each event payload.

2. **Database migrations**
   - Added `026_events_ingestion_upgrade.sql` to upgrade legacy `events` tables with ingestion-era columns, indexes, and triggers.
   - Added `027_sessions_created_by_backfill.sql` to recreate/backfill `sessions.created_by` and ensure consistent queries.

3. **Map create-event CTA**
   - Map list cards and popups now show “Create an event →” and route authenticated users directly to `/create?activityId=…`, prompting auth when needed and tracking with `map_activity_event_create_requested`.

4. **WebMap customization**
   - `WebMap` accepts an optional `activityActionLabel` prop so different surfaces can control the CTA text.

5. **Create flow deep-linking**
   - `/create` reads `activityId` and `activityName` from the query string and pre-fills the form when arriving from the map or other deep links.

6. **Documentation consolidation**
   - Added `PROJECT_OVERVIEW.md` and `ROADMAP.md`, replaced the default Next.js README inside `apps/doWhat-web`, noted the canonical docs from the mobile README, and linked everything from the root `README.md`. This keeps onboarding info, errors, and changes synchronized for future collaborators/agents.

## 2026-02-01

1. **Stabilization kickoff (discovery/map/venues)**
   - Logged the new stabilization scope (duplicate home events, hardcoded discovery removal, map/venues runtime errors, and auth gating) and started targeted fixes in the web app while preserving the “real Supabase data only” rule.

2. **Venues runtime fix (availability-tier init)**
   - Resolved the `ReferenceError: availableTier3Ids before initialization` by reordering the taxonomy-category sync effect after the memoized tier-3 availability list in `apps/doWhat-web/src/app/venues/page.tsx`.

3. **Home events: removed duplicate feed**
   - Deleted the separate “Discovered Nearby” block (and its component) so the homepage has a single canonical events feed with one empty state. Files: `apps/doWhat-web/src/app/page.tsx`, removed `apps/doWhat-web/src/components/home/NearbyDiscoverList.tsx`.

4. **Discovery debug: map/venues pipeline audit**
   - Traced `/map` + venues discovery flows and confirmed: `/api/nearby` currently returns activities without facet metadata, map client only filters by search term, and venues activity summary is pre-seeded via `ACTIVITY_NAMES` (even with zero counts). Flagged these as likely contributors to “only chess” showing and to filter options appearing without real DB backing. (Investigation only; fixes follow.)

5. **Map discovery pipeline upgrades**
   - Rebuilt `/api/nearby` to use the shared discovery engine so it returns real items plus filter support/facets/source metadata. Added full filter serialization (taxonomy, price, capacity, time window), expanded shared map types, and applied client-side filtering on the map to ensure every supported filter actually affects results while gracefully skipping unsupported metadata.

6. **Venues discovery cleanup**
   - Removed the pre-seeded activity summary list by deriving availability only from real venue signals, and blocked venue searches when the summary is empty so the page falls back to the clean “no activity signals yet” empty state instead of defaulting to chess.

7. **Empty state copy polish**
   - Updated the homepage empty state headline to “No events nearby yet” to match the product requirement for discovery messaging.

## 2026-02-08

1. **Discovery engine build failure investigation**
   - Tracked the build error to `apps/doWhat-web/src/lib/discovery/engine.ts` importing the missing `@dowhat/discovery-engine` package and a non-existent `@/lib/discovery/bounds` module. Planned local replacements to restore compile-time behavior without introducing mock data.

2. **Discovery engine core + bounds restoration**
   - Added `apps/doWhat-web/src/lib/discovery/engine-core.ts` to replace the missing `@dowhat/discovery-engine` module (types + normalization + cache constants + tile key + cache key builder).
   - Added `apps/doWhat-web/src/lib/discovery/bounds.ts` to safely compute query bounds from radius/center or normalize provided bounds.
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to consume the new local core utilities and reuse the shared `haversineMeters` helper.

3. **Discovery + map type fixes for web typecheck**
   - Added `/api/discovery/activities` route (calls `discoverNearbyActivities`, normalizes place labels, supports bounds + refresh, and defaults filter/facet metadata) to satisfy the existing tests.
   - Added `refresh` support to nearby API + shared fetcher types, and widened map filter query typings to allow tags.
   - Tightened discovery engine typing (null-safe source breakdown, distance sort guard, venue search result typing) and updated AuthGate route typing.
   - Patched test helpers to use safe casts for Node web globals and Jest mock typings.

4. **Validation runs (web + mobile)**
   - Web build failed in this environment because `next/font` could not reach `fonts.googleapis.com` (network restricted).
   - Web typecheck + Jest now pass after fixing discovery/map test typings and ICS recurrence normalization; Jest still emits console warnings from mocked Supabase/DB columns.
   - Web lint fails with existing rule violations (unused vars, hooks deps, explicit-any, display-name, and hooks usage) across several files.
   - Mobile typecheck + Jest pass, but Expo iOS/Android runs fail locally (missing CocoaPods + Homebrew for iOS; Android prebuild unable to create native directory).

5. **UI/UX refresh kickoff (web + mobile)**
   - Began redesign pass focused on the web home/navigation shell and shared mobile components (search, empty state, brand, hero cards) to improve visual hierarchy, spacing, and clarity without introducing mock data.
6. **Mobile SearchBar UX refresh**
   - Removed the hardcoded suggested-search fallback (now defaults to empty) to avoid fake content. Tightened the search input, filter button, and suggestion chip styling to align with the brand palette and improve focus clarity.
7. **Mobile EmptyState UX refresh**
   - Rebuilt the empty state into a branded panel with theme colors, softer icon treatment, and improved CTA styling for clearer hierarchy on iOS/Android.
8. **Mobile FindA4thHero styling + data-safe fallbacks**
   - Restyled the hero cards with theme colors, pill metadata, and tighter spacing. Removed the hardcoded venue placeholder and only render venue labels when provided.
9. **Mobile ActivityList visual cleanup**
   - Updated list cards to the shared theme palette, refined shadows/borders, and improved contrast for metadata and progress bars to match the refreshed UI language.
10. **Mobile home search suggestion note**
   - Updated the search suggestion comment in `home.tsx` to reflect that suggestions are derived from real nearby activity names (no simulated data).
11. **Validation runs (web + mobile)**
   - Web: `next build` fails in this environment because Google Fonts cannot be reached (fonts.googleapis.com ENOTFOUND). `next lint` still fails with existing lint issues in tests/components/hooks. `pnpm --filter dowhat-web test` passes but emits console warnings from mocked Supabase/missing columns. `pnpm --filter dowhat-web typecheck` passes.
   - Mobile: `pnpm --filter doWhat-mobile typecheck` + `test` pass but emit baseline-browser-mapping warnings and mocked Supabase console warnings. `expo run:ios` fails due to missing CocoaPods/Homebrew. `expo run:android` fails to create the native android directory.
12. **Venues page chunk error fix**
   - Switched the venues map from a dynamic import to a direct component import so the page no longer depends on a missing client chunk at runtime.
13. **Map page chunk resilience**
   - Removed the dynamic import wrapper around WebMap and used a direct client import to avoid missing client chunks in dev.

## 2026-02-11

1. **Session continuation + log discipline**
   - Read `changes_log.md` before continuing work and adopted a step-by-step logging workflow for this session.

2. **Sports onboarding save hardening (mobile)**
   - Updated `apps/doWhat-mobile/src/app/onboarding/sports.tsx` save flow to repair legacy profile rows that can trigger `profiles.user_id` null-constraint failures during upsert.
   - Logic now retries profile upsert after a targeted `user_id` repair update when Postgres error `23502` references `user_id`.

3. **Map abort-noise suppression (mobile)**
   - Updated `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` to treat abort-like fetch errors as non-fatal during places loading/fallback.
   - Added an explicit empty response path for aborted map requests to avoid surfacing `[Map] ... AbortError` as a user-facing failure during normal viewport churn.

4. **Validation after fixes**
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` (pass after code update).
5. **Runtime environment reset**
   - Restarted active dev runtimes after they dropped (`dowhat-web` on `http://localhost:3002`, Expo dev-client on `http://localhost:8081`) before continuing platform proofs.
6. **Fresh browser proof captures (web + mobile web)**
   - Captured fresh screenshots after runtime restart for:
     - Web: `/`, `/auth`, `/discover`
     - Mobile web (Expo): `/`, `/(tabs)/map`, `/onboarding/sports`
   - Verified current UI loads without the prior unstyled/blank-page regressions.
7. **iOS native proof captures (post-fix)**
   - Captured iOS screenshots for native app home, onboarding sports route, and map route after the latest map/onboarding fixes.
   - Observed current state:
     - Home loads without the previous save/network error overlays.
     - Onboarding sports screen loads with selectable cards.
     - Map opens and loads map tiles with no immediate red-box/network-failed overlay.
8. **Android verification status update**
   - Captured Android screenshots for home/onboarding/map via `adb` deep-link flow.
   - Found Android app intermittently opening into the development-client shell (`Development servers`) rather than directly into the in-app UI, which affects deterministic screenshot proof.
   - Cleared/re-captured `adb logcat` to isolate current failures. Latest clean relaunch did not reproduce the prior `profiles.user_id` (`23502`) error; ongoing issue appears tied to dev-client routing/session state and intermittent network failures.
9. **Android clean runtime repro + proof update**
   - Reconnected Android through Expo (`a`) and captured new clean screenshots after a fresh bundle load.
   - Confirmed Android home and onboarding render without the previous error toasts in the new session.
   - Captured Android map route loading state (spinner + controls); no immediate red network-error toast in this fresh run.
10. **Reliability pledge save hardening (mobile)**
   - Updated `apps/doWhat-mobile/src/app/onboarding/reliability-pledge.tsx` to mirror the sports-onboarding resilience path for legacy profile rows.
   - Save now uses profile upsert with `id` + `user_id`, and on `23502` (`user_id`) it performs a targeted repair update and retries upsert.
11. **Map events fetch path corrected for native**
   - Updated `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` so native platforms (`ios`/`android`) use Supabase fallback events directly instead of web `/api/events` first.
   - This removes avoidable cross-host dependency from native map events loading and reduces false network-failure surface area.
12. **Map logging-noise cleanup**
   - Downgraded non-fatal map diagnostics from `console.warn` to `console.info` across fallback/abort pathways so expected resilience paths no longer appear as warning-level runtime failures during normal use.
13. **Onboarding reliability test mock updated**
   - Updated `apps/doWhat-mobile/src/app/__tests__/onboarding-reliability-pledge.test.tsx` Supabase mock to include `.upsert(...)` support after the reliability screen save-path change.
14. **Viewport query algorithm guardrails (map)**
   - Added query dedupe helpers in `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`:
     - `viewportQueriesEqual(...)`
     - `regionNeedsQueryRefresh(...)`
     - time-based throttle via `lastQuerySyncAtRef`
   - Query refresh now requires meaningful viewport change (or explicit force) and respects a minimum refresh interval to prevent bursty map refetch churn.
15. **Validation reruns after latest patches**
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed (with baseline-browser-mapping staleness warning unchanged).
16. **Fresh platform proofs captured (post-fix)**
   - Web (Next): `/tmp/dowhat-web-home-proof-after-fixes.png`, `/tmp/dowhat-web-auth-proof-after-fixes.png`, `/tmp/dowhat-web-discover-proof-after-fixes.png`.
   - Mobile web (Expo web): `/tmp/dowhat-mobile-web-home-proof-after-fixes.png`, `/tmp/dowhat-mobile-web-map-proof-after-fixes.png`, `/tmp/dowhat-mobile-web-onboarding-proof-after-fixes.png`.
   - iOS (sim): `/tmp/dowhat-ios-home-proof-after-fixes.png`, `/tmp/dowhat-ios-onboarding-proof-after-fixes.png`, `/tmp/dowhat-ios-map-proof-after-fixes.png`.
   - Android (emulator): `/tmp/dowhat-android-home-proof-after-fixes-final.png`, `/tmp/dowhat-android-onboarding-proof-after-fixes-final.png`, `/tmp/dowhat-android-map-proof-after-fixes-final.png`.
17. **Android remaining visual caveat**
   - Android screenshots still show a bottom toast (`Cannot connect to Metro...`) from Expo Development Client state management.
   - This is a dev-runtime banner (not an app logic crash, not a Supabase error, not map fetch failure) and does not block in-app map/home/onboarding rendering in the captured runs.
18. **Map query refinement follow-up**
   - Removed an over-eager forced query-sync effect that was still causing repeated viewport query updates.
   - Added rounded events-query bounds (`3` decimals) to stabilize query keys and reduce tiny-coordinate cache misses.
   - Added query-key tolerance in `viewportQueriesEqual(...)` to avoid refetches caused only by floating-point noise.
19. **Post-refinement validation**
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran final route screenshot checks for web/mobile-web/native routes; map/home/onboarding continue to render after the query refinements.
20. **Android web-base host resolution fix**
   - Fixed `apps/doWhat-mobile/src/lib/web.ts` host extraction logic to only rewrite `localhost` to `10.0.2.2` on Android emulator (`!Constants.isDevice`), avoiding invalid host rewriting on real Android devices.
21. **Android startup reliability helper**
   - Added `apps/doWhat-mobile/scripts/start-android.sh` and wired `start:android` to use it.
   - The helper now clears stale dev ports, auto-starts the web dev server when needed, configures `adb reverse` for Metro/API, pins Expo dev-client host to localhost, and sets `EXPO_PUBLIC_WEB_URL` deterministically.
22. **Mobile docs sync**
   - Updated `apps/doWhat-mobile/README.md` quick-launch instructions to include the new Android startup helper and expected behavior.
23. **Web map query-key stabilization**
   - Updated `apps/doWhat-web/src/app/map/page.tsx` to reduce map refetch churn from floating-point jitter:
     - bounds comparison now uses tolerance instead of strict equality,
     - events query bounds are normalized/rounded (`3` decimals) before `useEvents` args are built.
   - This keeps `/api/events` query keys stable when map movement is visually unchanged.
24. **Validation reruns after web map stabilization**
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter dowhat-web test -- map` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed (baseline-browser-mapping staleness warning unchanged).
25. **Fresh proof captures (current run)**
   - Web screenshots:
     - `/tmp/dowhat-web-home-proof-current4.png`
     - `/tmp/dowhat-web-auth-proof-current4.png`
     - `/tmp/dowhat-web-discover-proof-current4.png`
     - `/tmp/dowhat-web-map-proof-current4.png`
   - Mobile web screenshots:
     - `/tmp/dowhat-mobile-web-home-proof-current4.png`
     - `/tmp/dowhat-mobile-web-onboarding-proof-current4.png`
     - `/tmp/dowhat-mobile-web-map-proof-current4.png`
   - iOS native screenshots:
     - `/tmp/dowhat-ios-home-proof-current4.png`
     - `/tmp/dowhat-ios-onboarding-proof-current4.png`
     - `/tmp/dowhat-ios-map-proof-current4.png`
   - Android native screenshots:
     - `/tmp/dowhat-android-home-proof-current4.png`
     - `/tmp/dowhat-android-onboarding-proof-current4.png`
     - `/tmp/dowhat-android-map-proof-current4.png`
26. **Runtime stability root-cause confirmation**
   - Confirmed repeated "Cannot connect to Metro" and "problem loading project" regressions were primarily runtime orchestration issues (dev servers not continuously alive), not new logic regressions in map/onboarding screens.
   - Re-established stable long-running sessions:
     - `pnpm --filter dowhat-web dev` (`http://localhost:3002`)
     - `pnpm --filter doWhat-mobile run start:ios` (`http://localhost:8081`)
     - `pnpm --filter doWhat-mobile run start:android` (`http://localhost:8081` + `adb reverse`)
27. **Deep-link behavior verification (Expo dev-client)**
   - Re-validated the correct launch sequence for development builds:
     1. Open project URL (`exp+dowhat-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`)
     2. Route with app scheme (`dowhat://...`)
   - Confirmed this avoids the recurring iOS `Failed to open app from .../--/...` failure state seen when route URL handling is attempted directly against dev-client project bootstrap.
28. **Fresh proof captures (current8/current8b)**
   - Web screenshots:
     - `/tmp/dowhat-web-home-proof-current8.png`
     - `/tmp/dowhat-web-auth-proof-current8.png`
     - `/tmp/dowhat-web-discover-proof-current8.png`
   - Mobile web screenshots:
     - `/tmp/dowhat-mobile-web-home-proof-current8.png`
     - `/tmp/dowhat-mobile-web-onboarding-proof-current8.png`
     - `/tmp/dowhat-mobile-web-map-proof-current8.png`
   - iOS native screenshots:
     - `/tmp/dowhat-ios-home-proof-current8.png`
     - `/tmp/dowhat-ios-onboarding-proof-current8.png`
     - `/tmp/dowhat-ios-map-proof-current8.png`
   - Android native screenshots:
     - `/tmp/dowhat-android-home-proof-current8b.png`
     - `/tmp/dowhat-android-onboarding-proof-current8b.png`
     - `/tmp/dowhat-android-map-proof-current8b.png`
29. **Android runtime log recheck**
   - Cleared and re-checked logcat during fresh routing flow; filtered scan did not show recurring:
     - `Network request failed`
     - `profiles.user_id` / `23502`
     - `[sports-onboarding] save failed`
     - `[reliability-pledge] save failed`
   - Android map now consistently surfaces real fallback/supabase venue counts (`places in view`) rather than failing with red-box network errors.
30. **Dev route opener helper (ios/android)**
   - Added `apps/doWhat-mobile/scripts/open-dev-route.sh` to make dev-client route testing deterministic.
   - The helper now:
     - opens Expo project URL first on cold start,
     - deep-links with `dowhat://...`,
     - retries route open once after boot delay,
     - skips project bootstrap on Android warm starts to avoid route override race.
   - Added scripts in `apps/doWhat-mobile/package.json`:
     - `open:route:ios`
     - `open:route:android`
31. **Mobile README route guidance update**
   - Updated `apps/doWhat-mobile/README.md` with route helper usage and explicit note that Expo Go style `/--/...` links should not be used for dev-build route bootstrap.
32. **Post-helper native validation**
   - iOS route helper validation:
     - `pnpm --filter doWhat-mobile run open:route:ios -- /map`
     - screenshot: `/tmp/dowhat-ios-map-proof-current9.png` (map loaded with places + controls).
   - Android route helper validation (after helper patch):
     - `pnpm --filter doWhat-mobile run open:route:android -- /map`
     - `pnpm --filter doWhat-mobile run open:route:android -- /onboarding/sports`
     - screenshots:
       - `/tmp/dowhat-android-map-proof-current10.png`
       - `/tmp/dowhat-android-onboarding-proof-current10.png`
     - no recurring filtered logcat hits for `Network request failed`, `23502`, `user_id`, or `Cannot connect to Metro` during this pass.
33. **Current quality gates (re-run)**
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed.
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter dowhat-web test -- map` passed.
34. **Staged file audit before release sync**
   - Re-reviewed every staged file diff to keep only actionable, production-relevant changes:
     - mobile startup/routing helpers,
     - onboarding save hardening,
     - map fetch + query stability improvements,
     - web map query-key stabilization,
     - Supabase security hardening migration,
     - docs/log updates.
   - Confirmed no temporary runtime artifacts (`web-dev.log`, transient screenshots) are included in the staged set.
35. **Final pre-commit quality gate rerun**
   - Re-ran `pnpm --filter dowhat-web typecheck` (pass).
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran `pnpm --filter dowhat-web test -- map` (pass).
   - Re-ran `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` (pass; baseline-browser-mapping staleness warning unchanged).

## 2026-02-12

1. **Supabase Security Advisor follow-up hardening migration**
   - Added `apps/doWhat-web/supabase/migrations/062_security_advisor_search_path_hardening.sql`.
   - Migration auto-detects all `public` functions without an explicit `search_path` and applies:
     - `SET search_path = public, extensions, pg_temp`
   - This targets the repeated `Function Search Path Mutable` warnings shown in Security Advisor.
2. **Supabase execution readiness check (blocked by placeholder DSN)**
   - Verified local DB tooling state:
     - `psql` not installed on this machine.
     - `brew` not available.
     - Node `pg` client is available via `dowhat-web` workspace dependencies.
   - Validated provided DSN format and confirmed it still contains `[YOUR-PASSWORD]` placeholder, so remote migration execution cannot authenticate yet.
3. **Migration 062 robustness hardening**
   - Updated `062_security_advisor_search_path_hardening.sql` to avoid brittle execution in production:
     - excludes extension-owned functions (`pg_depend` + `pg_extension`),
     - wraps each `ALTER FUNCTION` in an exception block and skips entries with insufficient privilege.
   - Goal: ensure migration completes while still clearing `Function Search Path Mutable` for app-owned `public` functions.
4. **Automated Supabase advisor-fix runner**
   - Added `scripts/apply-security-advisor-fixes.mjs`.
   - Script behavior:
     - uses `SUPABASE_DB_URL`/`DATABASE_URL`,
     - applies migrations `061` and `062` with schema-migration tracking,
     - prints a verification summary for:
       - remaining mutable `public` functions,
       - `security_invoker` status of target views,
       - `spatial_ref_sys` RLS + read policy status.
   - Added root npm script: `db:advisor:fix`.
5. **Runner validation in local environment**
   - Syntax check passed: `node --check scripts/apply-security-advisor-fixes.mjs`.
   - Placeholder guard confirmed: running with `[YOUR-PASSWORD]` DSN exits early with clear error message.
6. **Migration 061 permission-safe update**
   - Remote execution failed on `must be owner of table spatial_ref_sys`.
   - Updated `061_security_advisor_hardening.sql` to be permission-safe for extension-owned tables:
     - wrapped RLS enable/policy creation/revokes in `DO` blocks with `insufficient_privilege` handling,
     - keeps advisor-targeted changes for app-owned objects while avoiding hard failure.
7. **Remote Supabase advisor fix execution (production DB)**
   - Ran `pnpm db:advisor:fix` against the configured Supabase project.
   - Applied migrations successfully:
     - `061_security_advisor_hardening.sql`
     - `062_security_advisor_search_path_hardening.sql`
   - Post-run verification summary:
     - `mutableFunctionCount`: `0`
     - target view `security_invoker` enabled for existing views (`dowhat_adoption_metrics`, `v_venue_activity_scores`, `v_venue_activity_votes`).
8. **Residual `spatial_ref_sys` advisory diagnosis**
   - Verified `public.spatial_ref_sys` owner is `supabase_admin` while current migration role is `postgres`.
   - Verified `postgres` cannot `SET ROLE supabase_admin` (`pg_has_role(..., 'member') = false`).
   - Conclusion: project-level DB credentials cannot enable RLS or create policy on `public.spatial_ref_sys`; this residual advisor item is ownership-constrained in Supabase managed extensions.
9. **Idempotency verification for advisor fixer**
   - Re-ran `pnpm db:advisor:fix` after successful application.
   - Confirmed idempotent behavior: migrations `061` and `062` were skipped as already applied.
   - Verification summary remained stable (`mutableFunctionCount = 0`; `spatial_ref_sys` ownership-limited state unchanged).
