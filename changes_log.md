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
