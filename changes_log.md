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
