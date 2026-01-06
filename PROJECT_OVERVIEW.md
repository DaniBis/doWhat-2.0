# Project Overview

Context for engineers/AI agents working on the doWhat monorepo. Use this as the single place to understand architecture, critical flows, and where to find deeper docs.

## Mission & Product Surfaces
- **Web (`apps/doWhat-web`)** – Next.js App Router experience for discovery (home, map, venues, create flow, events) plus admin tooling.
- **Mobile (`apps/doWhat-mobile`)** – Expo Router client that shares Supabase auth, taxonomy, and analytics primitives with web.
- **Shared package (`packages/shared`)** – Types, fetch helpers, taxonomy utilities, analytics trackers, etc.
- **Supabase backend** – Auth, Postgres, RPC functions, Row Level Security, and cron-style HTTP endpoints.

## Architecture Snapshot
- **Frontend stack** – React/Next.js 14 (app router) with Tailwind, React Query, and Mapbox GL; Expo RN 50 with Expo Router.
- **Data access** – `@supabase/supabase-js` browser client for user sessions; service-role client for API routes. React Query for caching.
- **APIs** – Next.js Route Handlers under `apps/doWhat-web/src/app/api`. Most follow `createServiceClient()` patterns so they can run in cron contexts.
- **Migrations** – SQL files in `apps/doWhat-web/supabase/migrations/`. `run_migrations.js` replays only pending migrations into any Postgres-compatible DB.
- **Cron endpoints** – `/api/cron/...` secured via `Authorization: Bearer $CRON_SECRET`. Scripts under `scripts/` wrap these for local seeding.

## Key Workflows
| Area | Entry Points | Notes |
| --- | --- | --- |
| Activities & Sessions | `/`, `/map`, `/create`, `/api/sessions`, `/api/nearby` | Nearby search uses RPC and PostGIS indexes. CTS: `sessions_nearby()`.
| Events ingestion | `/api/cron/events/run`, `/api/events`, `/api/events/[id]` | Docs in `docs/events-ingestion.md`. Events join to `places` either via Supabase relationship or manual enrichment.
| Places layer | `/api/places`, `/api/places/:id`, `/api/cron/places/bangkok` | OSM + Foursquare cached in `places` + `place_sources`. Details in root README + migrations `014/016`.
| Activity taxonomy | `packages/shared/src/taxonomy`, `/api/taxonomy`, `docs/activity-taxonomy.md` | Supabase view seeds for filters across surfaces.
| Auth | Supabase email magic links + providers. Web honors `NEXT_PUBLIC_ADMIN_EMAILS` for gatekeeping sensitive pages.

## Environment & Commands
- **Setup:** `pnpm install`
- **Web dev:** `pnpm --filter dowhat-web dev`
- **Mobile dev:** `pnpm --filter dowhat-mobile exec expo start -c`
- **Migrations:** `DATABASE_URL=postgres://... node run_migrations.js`
- **Seed helpers:** `pnpm seed:places:bangkok`, `pnpm seed:events:bangkok`, `pnpm seed:taxonomy`

Required env vars live in `README.md`. Highlight:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `CRON_SECRET`
- Mobile requires matching `EXPO_PUBLIC_SUPABASE_*` and optionally `EXPO_PUBLIC_WEB_URL`/`EXPO_PREFER_LAN`.

## Observability & Logs
- Structured troubleshooting is captured in `error_log.md` (chronological). Update after each resolved issue.
- Feature/config changes belong in `changes_log.md`.
- Domain-specific deep dives live under `docs/` (taxonomy, events ingestion).

## Hand-off Checklist
When onboarding an AI agent or collaborator:
1. Read this file + `README.md` for environment details.
2. Skim `ROADMAP.md` to understand active objectives.
3. Review `changes_log.md` and `error_log.md` for recent interventions.
4. Consult `docs/` for domain-specific constraints before editing ingestion/taxonomy.
5. Confirm migrations are in sync via `node run_migrations.js`.

## Useful References
- `apps/doWhat-web/src/app/map/page.tsx` – canonical view combining activities, events, filters, analytics.
- `apps/doWhat-web/src/app/api/events/route.ts` – best practice for service-role queries + manual joins.
- `apps/doWhat-web/src/lib/supabase/service.ts` – how to instantiate clients safely.
- `packages/shared/src/events` – query hooks and fetcher factories used across surfaces.

Keep this overview updated whenever architecture, tooling, or onboarding expectations change.
