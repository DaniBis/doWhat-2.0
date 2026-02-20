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
10. **PostGIS placement audit against production Supabase**
    - Audited extension metadata in live DB:
      - `postgis` exists, schema = `public`, version = `3.3.7`, `extrelocatable = false`.
      - `spatial_ref_sys` is extension-member (`is_postgis_member = true`) and owner `supabase_admin`.
      - Found active spatial columns in app tables: `activities.geom`, `events.geom`, `places.geom`.
11. **Permission probes for documented troubleshooting path**
    - Confirmed current role cannot run required catalog mutation:
      - `UPDATE pg_extension SET extrelocatable = true WHERE extname='postgis'` -> `permission denied for table pg_extension`.
    - Confirmed direct relocation is blocked in current state:
      - `ALTER EXTENSION postgis SET SCHEMA extensions` -> `extension "postgis" does not support SET SCHEMA`.
12. **Risk assessment for drop/reinstall workaround**
    - Executed rollback-only probe for `DROP EXTENSION postgis CASCADE`.
    - Given live geometry dependencies in core app tables, drop/reinstall was marked unsafe for self-service execution in production.
13. **Supabase doc alignment confirmation**
    - Reviewed Supabase PostGIS troubleshooting guidance and confirmed this scenario requires the relocation sequence that starts with changing `extrelocatable`, a step not executable with current project-level role privileges.
14. **Resolution path identified (support-assisted extension relocation)**
    - Determined remaining Security Advisor `spatial_ref_sys` finding can only be cleared via support-assisted PostGIS relocation from `public` to `extensions` for this project.
15. **Clarified Supabase support-only PostGIS relocation sequence**
    - Identified and shared the exact SQL block from the official PostGIS troubleshooting docs that Supabase support can run when `postgis` is stuck in `public` and non-relocatable.
    - Confirmed this sequence is privileged because it mutates `pg_extension` metadata and requires elevated ownership/permissions.
16. **Post-support verification run (live DB)**
    - Re-ran `pnpm db:advisor:fix` against production after support confirmation.
    - Verification summary now reports:
      - `mutableFunctionCount = 0`
      - `spatialRefSys = null` (no longer present in `public`)
      - advisor-target views remain `security_invoker = true`.
17. **PostGIS relocation confirmed complete**
    - Direct metadata checks confirm support successfully moved PostGIS objects:
      - extension schema: `extensions` (was `public`)
      - `spatial_ref_sys` table schema: `extensions`
      - `st_*` function count: `public = 0`, `extensions = 439`.
    - This matches the expected end state from the Supabase troubleshooting path.
18. **Security Advisor remaining items triage**
    - Confirmed Security Advisor still reports:
      - `Security Definer View` error for `public.social_sweat_adoption_metrics` (typo in migration `061` targeted `social_sweet_*`).
      - `Extension in Public` warnings for `vector`, `cube`, `earthdistance`, and `pg_net`.
      - `Auth`/`Config` warnings that must be resolved in the Supabase Dashboard (OTP expiry, leaked password protection, and Postgres patch upgrade).
19. **Security Advisor view + extension migrations (DB-level)**
    - Added `apps/doWhat-web/supabase/migrations/063_security_advisor_view_invoker_followup.sql` to set `security_invoker=true` on `public.social_sweat_adoption_metrics` (and keep back-compat for the earlier typo).
    - Added `apps/doWhat-web/supabase/migrations/064_security_advisor_extension_schema_cleanup.sql` to move `vector`, `cube`, and `earthdistance` out of `public` and reinstall `pg_net` into `extensions` (pauses any `cron.job` rows calling `net.http_*` while doing so).
    - Fixed the typo in `apps/doWhat-web/supabase/migrations/061_security_advisor_hardening.sql` so fresh installs target `social_sweat_*` correctly.
20. **Advisor-fix runner upgraded**
    - Updated `scripts/apply-security-advisor-fixes.mjs` to:
      - apply migrations `063` + `064`,
      - verify `security_invoker` for both `social_sweat_*` and `social_sweet_*`,
      - report extension schema placement for `vector`, `cube`, `earthdistance`, `pg_net`, and `postgis`.
21. **Migration apply attempt + cron privilege fix**
    - Ran `pnpm db:advisor:fix` against production:
      - `063_security_advisor_view_invoker_followup.sql` applied successfully.
      - `064_security_advisor_extension_schema_cleanup.sql` failed with `permission denied for table job` while attempting to pause `cron.job`.
    - Updated `064_security_advisor_extension_schema_cleanup.sql` to treat `cron.job` access as best-effort:
      - catches `insufficient_privilege` and continues with the extension relocation/reinstall path.
22. **Security Advisor DB-level items cleared**
    - Re-ran `pnpm db:advisor:fix` and applied `064_security_advisor_extension_schema_cleanup.sql` successfully.

## 2026-02-18

1. **Context + discovery algorithm review (no code changes)**
   - Read `changes_log.md` and reviewed the discovery + venue ranking logic plus event/session hydration to assess activity-to-place/event matching.
   - Files reviewed: `apps/doWhat-web/src/lib/discovery/engine.ts`, `apps/doWhat-web/src/lib/venues/search.ts`, `apps/doWhat-web/src/lib/recommendations/engine.ts`, `apps/doWhat-web/src/app/api/events/route.ts`, `apps/doWhat-web/src/lib/sessions/server.ts`, `apps/doWhat-web/src/lib/events/venueMatching.ts`.
2. **Map default mode now shows activities + events together**
   - Updated `apps/doWhat-web/src/app/map/page.tsx` so the map opens in `both` mode by default, matching the requirement to surface activities and events simultaneously.
3. **Strict place-backed activity enforcement in discovery**
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to only return activities that are canonical app activities (`id` is UUID) and linked to a canonical place (`place_id` is UUID).
   - This removes venue-proxy fallback items from the map activity feed and hardens activity-to-real-place accuracy.
4. **Activity detail navigation from map/list interactions**
   - Added explicit “View details →” actions for activities in both the map popup and list cards.
   - Updated `apps/doWhat-web/src/components/WebMap.tsx` and `apps/doWhat-web/src/app/map/page.tsx` with a dedicated activity details callback.
   - UUID activities now route to `/activities/[id]`; non-UUID fallback path safely redirects to create-event prefill.
5. **Validation for modified files**
   - Checked diagnostics for:
     - `apps/doWhat-web/src/app/map/page.tsx`
     - `apps/doWhat-web/src/components/WebMap.tsx`
     - `apps/doWhat-web/src/lib/discovery/engine.ts`
   - Result: no TypeScript/editor errors after the above changes.
6. **Workspace typecheck re-run after map/discovery hardening**
   - Ran workspace `typecheck` task (`pnpm -r run typecheck`).
   - Result: `packages/shared`, `apps/doWhat-web`, and `apps/doWhat-mobile` all passed.
    - Verification summary now confirms:
      - `mutableFunctionCount = 0`
      - `public.social_sweat_adoption_metrics security_invoker = true`
      - `vector`, `cube`, `earthdistance`, `pg_net`, and `postgis` all installed under schema `extensions`.
23. **Security Advisor remaining dashboard-only warnings**
    - Identified the remaining warnings as Supabase Dashboard configuration items (not SQL-migrationable):
      - `Auth OTP Long Expiry`
      - `Leaked Password Protection Disabled`
      - `Postgres version has security patches available`
    - Prepared step-by-step dashboard remediation guidance for the owner to apply.
24. **Post-DB-fix full regression pass (start)**
    - Began a fresh end-to-end verification run across web + mobile (web/iOS/Android):
      - typecheck, unit tests, lint
      - smoke navigation through core user surfaces (home/auth/discover/map/onboarding)
    - Any failures found in this pass will be fixed and re-verified before final sign-off.
25. **Typecheck re-run (post Security Advisor cleanup)**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
26. **Web lint + unit tests re-run (clean)**
    - `pnpm --filter dowhat-web lint` passed with no ESLint warnings/errors.
    - `pnpm --filter dowhat-web test` passed (67/67 suites, 227/227 tests) with no console noise.
27. **Mobile unit tests re-run (clean)**
    - Removed noisy debug logs from `apps/doWhat-mobile/src/app/home.tsx` and `apps/doWhat-mobile/src/app/people-filter.tsx`.
    - Downgraded `ProfileSimple` save failure logging to dev-only warnings (and suppressed in tests) in `apps/doWhat-mobile/src/app/profile.simple.tsx`.
    - Patched `baseline-browser-mapping@2.8.31` to suppress its stale-data warning under Jest workers; added `patches/baseline-browser-mapping@2.8.31.patch` + `pnpm.patchedDependencies` wiring.
    - `pnpm --filter doWhat-mobile test` passed (18/18 suites, 78/78 tests) with no console noise/warnings.
28. **Repo ESLint check**
    - `pnpm lint` passed.
29. **Root Jest warning cleanup**
    - Removed `collectCoverage: false` from `supabase/functions/jest.config.js` to eliminate the Jest config validation warning during `pnpm test`.
    - `pnpm test` now runs clean (no config warnings).
30. **Typecheck re-run (full)**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
    - `pnpm --filter @dowhat/shared typecheck` passed.
31. **People filters cleanup (mobile)**
    - Normalized indentation for the `fetchNearbyTraits` / `applyFilters` helpers after removing debug logs in `apps/doWhat-mobile/src/app/people-filter.tsx`.
32. **Pre-commit regression gates**
    - `pnpm lint` passed.
    - `pnpm test` passed (94/94 suites, 358/358 tests) with no warnings/errors.
33. **Final log hygiene**
    - Normalized the `saveEdits` try/catch indentation in `apps/doWhat-mobile/src/app/profile.simple.tsx` after removing the mount-time `console.log`.
    - Re-ran `pnpm lint` + `pnpm test` to confirm the repo remains clean.

## 2026-02-13

1. **Quality gates re-run (clean)**
   - `pnpm lint` passed.
   - `pnpm test` passed (94/94 suites, 358/358 tests) with no warnings/errors.
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter doWhat-mobile typecheck` passed.

2. **Web + mobile-web smoke proof captures**
   - Web (Next) screenshots:
     - `/tmp/proof-20260213-web-home.png`
     - `/tmp/proof-20260213-web-auth.png`
     - `/tmp/proof-20260213-web-discover.png`
     - `/tmp/proof-20260213-web-map.png`
   - Mobile web (Expo) screenshots:
     - `/tmp/proof-20260213-mobile-web-home.png`
     - `/tmp/proof-20260213-mobile-web-map.png`
     - `/tmp/proof-20260213-mobile-web-onboarding-sports.png`

3. **iOS + Android smoke proof captures**
   - iOS (Simulator) screenshots:
     - `/tmp/proof-20260213-ios-home.png`
     - `/tmp/proof-20260213-ios-map.png`
     - `/tmp/proof-20260213-ios-onboarding-sports.png`
   - Android (Emulator) screenshots:
     - `/tmp/proof-20260213-android-home.png`
     - `/tmp/proof-20260213-android-map.png`
     - `/tmp/proof-20260213-android-onboarding-sports.png`
   - Android logcat scan (after clearing logs and re-opening routes) showed no fresh matches for:
     - `Network request failed`, `23502`, `profiles.user_id`, onboarding save failures, or Metro connection errors.

## 2026-02-16 (Continuation)

1. **Session resume + state restore**
   - Re-read `changes_log.md` to continue from latest validated point.
   - Confirmed current working tree contains pending changes in:
     - `apps/doWhat-mobile/src/app/__tests__/onboarding-reliability-pledge.test.tsx`
     - `apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`
     - `apps/doWhat-mobile/src/app/__tests__/sessions.contest-analytics.test.tsx`
     - `apps/doWhat-web/src/app/layout.tsx`
     - `package.json`
     - `pnpm-lock.yaml`
     - `scripts/health-migrations.mjs`
     - `scripts/health-notifications.mjs`
     - deleted `patches/baseline-browser-mapping@2.8.31.patch`

2. **Current regression focus**
   - Android screenshot evidence shows intermittent `System UI isn't responding` and toast-level `Network request failed`/deep-link parse noise during rapid route smoke automation.
   - Next step is a dedicated Android diagnosis pass (adb logs + controlled route open cadence) and then retest web/iOS/Android smoke paths with fresh captures.

## 2026-02-17

1. **Android diagnosis pass executed (controlled cadence + fresh captures)**
   - Re-ran Android route opens in controlled sequence (`/map` -> `/onboarding/sports` -> `/home`) with fixed delays and fresh log capture.
   - Captured new artifacts:
     - `/tmp/proof-20260217-android-map-v2.png`
     - `/tmp/proof-20260217-android-onboarding-sports-v2.png`
     - `/tmp/proof-20260217-android-home-v2.png`
     - `/tmp/proof-20260217-android-logcat-v2.txt`

2. **Dev route opener hardening (Android)**
   - Updated `apps/doWhat-mobile/scripts/open-dev-route.sh`:
     - deep-link format now uses `dowhat:///...` (path-safe form instead of host-like parsing),
     - Android retry open now runs only for cold-start bootstrap paths (skips warm-start duplicate route replay).
   - Goal: reduce unnecessary activity restarts/UI churn and remove one source of routing noise during automation.

3. **Android startup preflight warning (network health)**
   - Updated `apps/doWhat-mobile/scripts/start-android.sh` to run a lightweight emulator outbound-network check (`ping 8.8.8.8`) after `adb reverse` setup.
   - When connectivity is broken, startup now emits an explicit warning so smoke-test failures are immediately attributable to emulator runtime health rather than app logic.

4. **Root-cause evidence: emulator network environment instability (not app DB logic regression)**
   - During failing windows, Android diagnostics showed repeated `TypeError: Network request failed` and `AuthRetryableFetchError` in app logs.
   - Emulator shell connectivity checks during the same run showed DNS/network instability symptoms (`ping ... unknown host`, intermittent missing resolver state, and network reachability inconsistency), explaining the bursty transport failures.
   - Existing app-specific historical failures were *not* reproduced in this pass:
     - no fresh `profiles.user_id` / `23502` onboarding save errors.

5. **Follow-up recommendation**
   - Treat remaining Android flakiness as runtime/emulator health first (stable emulator networking, then route smoke).
   - Keep app-level verification focused on deterministic proofs after emulator connectivity is healthy.

## 2026-02-18

1. **Android smoke re-run after network-health recovery (clean)**
    - Confirmed emulator outbound connectivity before rerun (`ping 8.8.8.8` successful).
    - Re-ran controlled Android route sequence via helper:
       - `/map`
       - `/onboarding/sports`
       - `/home`
    - Captured fresh Android artifacts:
       - `/tmp/proof-20260218-android-map.png`
       - `/tmp/proof-20260218-android-onboarding-sports.png`
       - `/tmp/proof-20260218-android-home.png`
       - `/tmp/proof-20260218-android-logcat.txt`
    - Log scan result (clean for tracked signatures):
       - `Network request failed`: `0`
       - deep-link route mismatch warning: `0`
       - `BLASTSyncEngine` ANR precursor warning: `0`
       - no fresh `23502` / `profiles.user_id` onboarding-save failures.

2. **Web smoke proof refresh**

## 2026-02-20

1. **Discovery intelligence coding kickoff: ranking module integrated**
   - Added `apps/doWhat-web/src/lib/discovery/ranking.ts` with a first-pass startup-grade ranking layer:
     - weighted component scoring (`relevance`, `proximity`, `temporal`, `socialProof`, `quality`),
     - stable `dedupe_key` generation,
     - per-item `rank_score` and `rank_breakdown`,
     - confidence outputs (`quality_confidence`, `place_match_confidence`).

2. **Discovery item contract extended with intelligence metadata**
   - Updated `apps/doWhat-web/src/lib/discovery/engine-core.ts` to include optional ranking/confidence fields on `DiscoveryItem`.
   - Updated shared map typing in `packages/shared/src/map/types.ts` so API/UI consumers can safely receive the same metadata.

3. **Ranking layer wired into activity discovery path**
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to execute ranking after hard eligibility gates (`isPlaceBackedActivity`) and before final ordering.
   - Updated ordering logic to prioritize `rank_score` with distance/name tie-breakers.

4. **Validation checks after coding kickoff**
   - Re-ran editor diagnostics on changed files (ranking + discovery + shared types): no TypeScript/editor errors.
5. **Discovery debug counters + confidence gate (implementation pass)**
   - Extended discovery result contract with optional `debug` metadata in `apps/doWhat-web/src/lib/discovery/engine-core.ts`:
     - candidate counters across retrieval/gating stages,
     - drop counters (`notPlaceBacked`, `lowConfidence`, `deduped`),
     - ranking policy metadata.
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to:
     - support `includeDebug` option,
     - expose cache-hit debug diagnostics,
     - apply explicit place-confidence gate (`ACTIVITY_PLACE_MIN_CONFIDENCE = 0.8`) after ranking,
     - compute stage-by-stage counters for explainability.
6. **Nearby API explain mode + exposure telemetry**
   - Added `explain` query parsing in `apps/doWhat-web/src/lib/filters.ts`.
   - Updated `apps/doWhat-web/src/app/api/nearby/route.ts` to pass `includeDebug` and optionally return `debug` payload when `explain=1`.
   - Added `apps/doWhat-web/src/lib/discovery/telemetry.ts` for sampled discovery exposure logs (`[discovery.exposure]`) including top item scores/confidence and debug counters.
   - Hardened telemetry request-id extraction for mocked request objects (`request.headers?.get?.(...)`).
7. **Validation reruns after explain/telemetry integration**
   - Re-ran targeted test: `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass).
   - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
8. **Persistent discovery exposure storage (DB schema)**
    - Added `apps/doWhat-web/supabase/migrations/065_discovery_exposures.sql`.
    - New table `public.discovery_exposures` stores sampled discovery request/result payloads for ranking analytics and future LTR pipelines.
    - Included indexes on `created_at` and `request_id`, enabled RLS, and revoked anon/authenticated direct access (service-role write path only).
9. **Telemetry persistence implementation (service-role, sampled)**
    - Updated `apps/doWhat-web/src/lib/discovery/telemetry.ts` to persist sampled exposures into `discovery_exposures` using optional service client.
    - Kept graceful fallback behavior (non-blocking, warn-once on insert failure).
    - Added test-only control via `DISCOVERY_EXPOSURE_ALLOW_IN_TEST=1` and helper reset hook `__telemetryTesting.resetWarnings()`.
10. **Nearby route non-blocking telemetry + request mock hardening**
      - Updated `apps/doWhat-web/src/app/api/nearby/route.ts` to keep telemetry fire-and-forget (`void recordDiscoveryExposure(...)`) and maintain mocked-request compatibility.
11. **New discovery telemetry unit tests**
      - Added `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` covering:
         - sampled persistence path (`DISCOVERY_EXPOSURE_SAMPLE_RATE=1`),
         - no-op path (`DISCOVERY_EXPOSURE_SAMPLE_RATE=0`).
12. **Validation reruns after persistence changes**
      - Ran targeted tests:
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all packages/apps pass.
13. **Telemetry batching added for exposure writes**
      - Upgraded `apps/doWhat-web/src/lib/discovery/telemetry.ts` to support in-memory batched writes with configurable controls:
         - `DISCOVERY_EXPOSURE_BATCH_SIZE` (default `10`)
         - `DISCOVERY_EXPOSURE_FLUSH_MS` (default `1500`)
      - Added internal queue flush scheduling and test helper `__telemetryTesting.flushNow()`.
      - Maintained non-blocking behavior and warn-once failure semantics.
14. **Exposure retention cleanup job (ops hardening)**
      - Added `scripts/discovery-exposures-cleanup.mjs` to remove rows older than retention window (`DISCOVERY_EXPOSURE_RETENTION_DAYS`, default `30`).
      - Added root script command `db:discovery:cleanup` in `package.json`.
15. **Telemetry tests expanded for batch behavior**
      - Updated `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` for batched insert payload shape.
      - Added explicit batch-threshold flush coverage (batch size `2` test path).
16. **Validation reruns after batching + cleanup job**
      - Re-ran targeted tests:
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
      - Syntax check passed for new script:
         - `node --check scripts/discovery-exposures-cleanup.mjs`
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
17. **Admin analytics endpoint for discovery exposures**
      - Added `apps/doWhat-web/src/app/api/admin/discovery-exposures/route.ts`.
      - Endpoint behavior:
         - admin-email allowlist protected (`NEXT_PUBLIC_ADMIN_EMAILS`),
         - configurable window (`days`) + row cap (`limit`),
         - returns aggregate metrics for ranking observability:
            - cache/degraded rates,
            - average returned items,
            - average after-confidence-gate candidates,
            - total dropped counters (`notPlaceBacked`, `lowConfidence`, `deduped`),
            - average top rank score,
            - top sources and hourly timeseries.
18. **Admin exposure analytics tests added**
      - Added `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` covering:
         - non-admin rejection path,
         - successful aggregate response for admin users.
      - Adjusted request mocking to avoid runtime dependency on global `Request` in Jest node environment.
19. **Compatibility fix for mocked query builders**
      - Updated admin analytics route query chain to avoid `.returns(...)` fluent helper (cast result data instead), keeping compatibility with existing mocked builders in tests.
20. **Validation reruns after admin analytics endpoint**
      - Re-ran targeted tests (all pass):
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts`
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts`
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
21. **Admin UI for discovery analytics (read-side dashboard)**
      - Added `apps/doWhat-web/src/app/admin/discovery-exposures/page.tsx`.
      - New admin page includes:
         - allowlist-auth guard behavior aligned with existing admin pages,
         - window (`days`) and row-limit controls,
         - summary metric cards (cache/degraded rates, average returned items, average top score),
         - gating impact counters (after-confidence-gate average + dropped totals),
         - top source breakdown and hourly timeseries list,
         - metadata footer (rows considered + cutoff timestamp).
22. **Admin dashboard navigation link update**
      - Added `Discovery Analytics` link on `apps/doWhat-web/src/app/admin/page.tsx` header nav.
      - Adjusted link typing to satisfy Next typed-routes (`as Route`).
23. **Validation reruns after admin UI integration**
      - Re-ran targeted tests:
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` (pass)
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
         - `apps/doWhat-web/src/app/admin/__tests__/page.test.tsx` (pass)
      - Re-ran narrowed recheck after typed-route fix:
         - `apps/doWhat-web/src/app/admin/__tests__/page.test.tsx` (pass)
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` (pass)
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
24. **Stage assessment + hard QA pass before release sync**
      - Product/engineering judgement (current stage):
         - Discovery is now in an **instrumented beta-hardening** phase (not MVP): ranking, confidence gating, dedupe metadata, sampled exposure logging, retention tooling, and admin analytics are in place.
         - Primary remaining risk is not core discovery correctness but operational tuning (threshold calibration, long-window signal quality, and batch ingestion volume controls in production).
      - Full validation sweep executed:
         - Full Jest suite run across workspace: `363/363` tests passed.
         - Workspace typecheck: passed for `packages/shared`, `apps/doWhat-web`, `apps/doWhat-mobile`.
         - API health check: `/api/health` returned `ok: true` with expected table checks healthy.
         - User-flow HTTP smoke routes returned `200`:
            - `/`
            - `/auth`
            - `/map`
            - `/admin`
            - `/admin/discovery-exposures`
      - Decision: proceed with shipping current change set (no additional feature coding required for this pass).

## 2026-02-19

1. **Discovery intelligence layer architecture design (startup-grade)**
    - Added a dedicated architecture/design document covering retrieval, ranking, dedupe, confidence scoring, observability, anti-abuse controls, and scalability roadmap.
    - New file: `docs/discovery_intelligence_layer_startup_design_2026-02-19.md`.
    - Design includes:
       - 3-stage retrieval→gating→ranking pipeline,
       - strict activity place-backing policy,
       - explainable weighted scoring model and confidence formulas,
       - hierarchical cross-source dedupe keys + merge policy,
       - phased migration plan (contract hardening → ranking extraction → cache/precompute scale → LTR).
    - Captured fresh web screenshots:
       - `/tmp/proof-20260218-web-home.png`
       - `/tmp/proof-20260218-web-auth.png`
       - `/tmp/proof-20260218-web-discover.png`
       - `/tmp/proof-20260218-web-map.png`

3. **iOS smoke proof refresh**
    - Captured fresh iOS simulator screenshots:
       - `/tmp/proof-20260218-ios-home.png`
       - `/tmp/proof-20260218-ios-map.png`
       - `/tmp/proof-20260218-ios-onboarding-sports.png`

4. **Mobile web proof refresh**
    - Captured fresh Expo web screenshots:
       - `/tmp/proof-20260218-mobile-web-home.png`
       - `/tmp/proof-20260218-mobile-web-map.png`
       - `/tmp/proof-20260218-mobile-web-onboarding-sports.png`

5. **Post-smoke validation gates (targeted) passed**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
    - `pnpm --filter dowhat-web test -- map` passed.
    - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed.
