# doWhat — Project Overview

Context for engineers and AI agents working inside the doWhat monorepo. This is now the single canonical overview; it merges the previous root file with `docs/handoff/PROJECT_OVERVIEW.md` so you do not need to consult multiple copies.

## 1. Mission & Product Pillars
- **Sport-first community:** onboarding forces users through Step 0 (traits, sport/skill, reliability pledge) before hosts prioritize them for open slots.
- **Host & ops tooling:** `/admin` dashboards plus creation/verification flows keep supply healthy and measurable.
- **Discovery surfaces:** consumer web/mobile apps expose filters, saved activities, Find a 4th hero, and shared ranking logic.
- **Telemetry & guardrails:** onboarding CTAs, saved toggles, and host attendance UIs emit analytics so adoption stays visible.

## 2. Monorepo Structure
```
apps/
	doWhat-web/        # Next.js 14 (App Router) targeting discovery + admin
	doWhat-mobile/     # Expo Router (React Native) for iOS/Android
packages/
	shared/            # Cross-platform TypeScript helpers, taxonomy, analytics
scripts/             # Health checks, seeding, verification, rollback
supabase/            # SQL migrations plus Edge Functions (notify-sms, etc.)
```
Other top-level assets include project-wide configs, Supabase helpers, and documentation snapshots under `docs/`.

## 3. Core Applications
### 3.1 Web (`apps/doWhat-web`)
- **Routes:** App Router under `src/app` with key paths `/`, `/onboarding`, `/people-filter`, `/map`, `/admin/*`, `/api/*`.
- **State/Data:** Supabase client per-request for server components plus React Query in client components.
- **UI:** TailwindCSS + shared theme tokens from `@dowhat/shared/src/theme.ts`.
- **Admin tooling:** `/admin` suite (sessions, venues, activities, new session wizard) and Playwright e2e coverage.

### 3.2 Mobile (`apps/doWhat-mobile`)
- **Router:** Expo Router with tab stack in `src/app/(tabs)` and onboarding stack under `src/app/onboarding`.
- **Features:** Home feed, Find a 4th hero carousel, saved activities context, people filter, Step 0 CTAs.
- **Testing:** Jest + React Native Testing Library suites for onboarding, people filter, and saved flows.

### 3.3 Shared Package (`packages/shared`)
- **Exports:** Theme tokens, analytics trackers, onboarding helpers, sports taxonomy, reliability scoring, saved-activity builders.
- **Usage:** Imported by both apps and scripts; type definitions (events/map/sessions) replicate Supabase schema.

## 4. Backend & Data Layer
- **Supabase:** Auth + Postgres with RLS; accessed via browser client and service-role client for API routes/cron jobs.
- **Migrations:** SQL under `apps/doWhat-web/supabase/migrations/025+`; executed with `pnpm run db:migrate` or `node run_migrations.js` for arbitrary Postgres URLs.
- **Functions & Cron:** Edge Functions in `supabase/functions/*` (notify-sms, mobile-session-attendance, mobile-disputes) and HTTP cron endpoints at `/api/cron/...` protected by `CRON_SECRET`.
- **Types:** `apps/doWhat-web/src/types/database.ts` plus shared enums keep TS definitions aligned with the database.

## 5. Architecture Snapshot & Key Workflows
- **Frontend stack:** Next.js 14 App Router + Tailwind/React Query/Mapbox GL; Expo RN 50 with Expo Router.
- **Data access:** `createClient` helpers wrap `@supabase/supabase-js` for browser/server contexts; API routes use service-role credentials.
- **Workflows overview:**

| Area | Entry Points | Notes |
| --- | --- | --- |
| Activities & Sessions | `/`, `/map`, `/create`, `/api/sessions`, `/api/nearby` | Nearby search relies on PostGIS (`sessions_nearby()` RPC).
| Events ingestion | `/api/cron/events/run`, `/api/events`, `/api/events/[id]` | Docs in `docs/events-ingestion.md`; events attach canonical places.
| Places layer | `/api/places`, `/api/places/:id`, `/api/cron/places/bangkok` | OSM + Foursquare data cached in `places` + `place_sources`.
| Places layer | `/api/places`, `/api/places/:id`, `/api/cron/places/bangkok` | OSM + Foursquare data cached in `places` + `place_sources`; canonical label normalization lives in `apps/doWhat-web/src/lib/places/labels.ts`.
| Activity taxonomy | `packages/shared/src/taxonomy`, `/api/taxonomy` | Shared taxonomy seeds filters across clients.
| Auth & gating | Supabase email magic links/providers | Admin pages require `NEXT_PUBLIC_ADMIN_EMAILS` allowlist.

## 6. Scripts & Automation
- `scripts/health-*.mjs`, `scripts/verify-dowhat.mjs` combine into `pnpm health`.
- `scripts/seed-dowhat.mjs`, `scripts/dowhat-shared.mjs`, `scripts/rollback-dowhat.mjs` keep pilot data fresh.
- `scripts/seed-places-bangkok.mjs`, `scripts/seed-events-bangkok.mjs`, `scripts/seed-activity-taxonomy.mjs` support demos.
- Cron helpers (`scripts/events-dry-run.cjs`, `scripts/manual-notify-sms-run.mjs`) wrap `/api/cron/*` endpoints.

## 7. Feature Highlights & Status
| Area | Highlights | Status |
| --- | --- | --- |
| Onboarding (Step 0) | Shared progress helpers, profile banners, nav CTA, sport selector, reliability pledge, telemetry wiring. | Implemented and fully tested.
| Admin tooling | Prefill-aware `/admin/new`, sessions/venues/activities CRUD, adoption metrics cards, Playwright coverage. | Landed, polishing ongoing.
| Saved activities | Shared payload builders, parity across web/mobile contexts, telemetry instrumentation. | Complete.
| Attendance & reliability | Trigger-based scoring, host roster UI, verified badge analytics. | Complete.
| Find a 4th Player | Shared ranking logic, mobile hero/cards partially shipping, telemetry pending final hookup. | Next roadmap push.

## 8. Testing & Quality Gates
- **Web:** `pnpm --filter dowhat-web run typecheck`, targeted Jest suites, Playwright admin specs (`PLAYWRIGHT_PORT=4302`).
- **Mobile:** `pnpm --filter doWhat-mobile run typecheck`, Jest RNTL suites, `npx expo-doctor` (managed workflow).
- **Shared:** `pnpm --filter @dowhat/shared test`.
- **Repo-wide:** `pnpm -w run lint`, `pnpm -w run typecheck`, `pnpm test -- --maxWorkers=50%`, `pnpm health`, `pnpm verify:dowhat`.

## 9. Environment & Commands
- **Setup:** `pnpm install`
- **Web dev:** `pnpm --filter dowhat-web dev`
- **Mobile dev:** `pnpm --filter doWhat-mobile exec expo start -c`
- **Build/Test:** use workspace scripts above; Playwright requires `.env.playwright.local`.
- **Migrations:** `DATABASE_URL=postgres://... node run_migrations.js` or `pnpm run db:migrate`.
- **Seed helpers:** `pnpm seed:taxonomy`, `pnpm seed:events:bangkok`, `pnpm seed:places:bangkok`, `pnpm seed:dowhat`.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_ADMIN_EMAILS`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `CRON_SECRET`, `NOTIFICATION_ADMIN_KEY`, `FOURSQUARE_API_KEY`, `OVERPASS_API_URL`.

## 10. Documentation & Logs
- `ENGINEERING_ROADMAP_2025.md`, `docs/current_app_overview_2025-12-03.md`, `docs/dowhat_pilot_validation.md`, and `docs/migrations_025-031_validation.md` hold deeper dives.
- `changes_log.md` and `error_log.md` capture chronological interventions. Update them whenever fixes land.
- `ASSISTANT_CHANGES_LOG.md` tracks AI edits; keep parity with this file when notable architecture shifts happen.

## 11. Hand-off Checklist
1. Read this overview plus `README.md` for environment setup.
2. Skim `ENGINEERING_ROADMAP_2025.md` (or latest roadmap) to understand active objectives.
3. Review `changes_log.md` and `error_log.md` to learn about recent interventions.
4. Consult `docs/` for domain-specific constraints (taxonomy, events ingestion, migrations) before touching those areas.
5. Run `pnpm health` and `node run_migrations.js` (or `pnpm run db:migrate`) to ensure your environment matches Supabase.
6. Ensure `PLAYWRIGHT_PORT` is free before executing e2e tests and rerun Expo Doctor before shipping mobile changes.

## 12. Useful References
- `apps/doWhat-web/src/app/map/page.tsx` — canonical map combining activities, events, filters, analytics.
- `apps/doWhat-web/src/app/api/events/route.ts` — service-role example with manual joins.
- `apps/doWhat-web/src/lib/supabase/service.ts` — Supabase client helpers.
- `packages/shared/src/events` — shared event hooks/fetchers for both clients.
- `docs/events-ingestion.md`, `docs/activity-taxonomy.md` — deep dives for ingestion and taxonomy flows.

Keep this document as the authoritative overview; if you add or remove major capabilities, update this file instead of creating additional copies.
