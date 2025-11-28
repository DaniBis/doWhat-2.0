# doWhat — Web + Mobile (Expo) with Supabase

This monorepo contains a Next.js web app and an Expo (React Native) mobile app that share a tiny utilities package. Supabase powers auth and data (sessions, RSVPs, profiles, venues, activities) and we use Postgres RPC for nearby search.

## Structure

- apps/
  - doWhat-web/ (Next.js App Router)
  - doWhat-mobile/ (Expo Router)
- packages/
  - shared/ (format helpers, types)

## Prerequisites

- Node 20+
- pnpm 9+
- Supabase project (URL + anon key)

## Environment variables

Create a `.env.local` at repo root (used by dev helpers):

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com,other@example.com
```

Web also reads env from its own folder; mobile reads EXPO_ variables from its own folder.

Web (`apps/doWhat-web/.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token
FOURSQUARE_API_KEY=your_foursquare_key
# Optional
GOOGLE_PLACES_API_KEY=optional_runtime_key
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
CRON_SECRET=devsecret
```

Mobile (`apps/doWhat-mobile/.env.local`):

```
EXPO_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Supabase configuration

Authentication → URL Configuration → Redirect URLs (add):

- `http://localhost:3000/auth/callback` (web)
- `dowhat://auth-callback` (mobile deep link)
- (optionally) `dowhat://auth-callback/`

Providers → Google:

- Leave redirect URI as the default Supabase callback: `https://<project>.supabase.co/auth/v1/callback`

## Run locally

Install deps once:

```
pnpm install
```

Web dev:

```
pnpm --filter ./apps/doWhat-web dev
```

Mobile dev (Expo):

```
pnpm --filter ./apps/doWhat-mobile exec expo start -c
```

## Admin features

- `/admin/new` – create a session (select/add activity/venue, set price and time)
- `/admin/sessions` – inline edit price/time and delete sessions
- `/admin/activities` – add/delete activities
- `/admin/venues` – add/delete venues (lat/lng optional)

Gatekeeper: set `NEXT_PUBLIC_ADMIN_EMAILS` to a comma-separated allowlist.

## Database notes

All SQL migrations now live in `apps/doWhat-web/supabase/migrations/` and follow the numeric prefix ordering (e.g. `014_places.sql`, `018_activity_taxonomy.sql`). A tiny helper script replays only the migrations that have not been stamped in the target database yet.

```
export SUPABASE_DB_URL=postgresql://user:pass@host:port/db
pnpm db:migrate
```

The command above runs `node run_migrations.js`, which will:

- create a `public.schema_migrations` ledger if it does not exist
- apply each SQL file exactly once (wrapped in a transaction)
- print progress so you can tail deploy logs or CI output

If you prefer the SQL editor, copy/paste individual files from the same folder in ascending order.

### Activity taxonomy storage

Migration `018_activity_taxonomy.sql` provisions two tables (`activity_categories`, `activity_taxonomy_state`) plus the `v_activity_taxonomy_flat` view so Postgres/Supabase clients can join the taxonomy without importing TypeScript code. After deploying the schema, seed the canonical taxonomy definition via:

```
export SUPABASE_DB_URL=postgresql://user:pass@host:port/db
pnpm seed:taxonomy
```

The seed script reads `packages/shared/src/taxonomy/activityTaxonomy.ts`, upserts every tier, cleans up removed IDs, and records the semantic version in `activity_taxonomy_state`. Supabase REST and Row Level Security policies allow public read-only access, matching the in-app usage.

The health endpoint `/api/health` still reports missing core tables (`badges`, `traits_catalog`, `places`, etc.) so you can double-check the schema after running migrations.

### Cron jobs & seed helpers

All scheduled endpoints require an `Authorization: Bearer $CRON_SECRET` header. Set `CRON_SECRET` in both your deployment environment and wherever the job is triggered from (GitHub Actions, Fly cron, etc.).

#### Trait recompute (nightly)

- Endpoint: `POST /api/traits/recompute/all?limit=50&offset=0`
- Strategy: increment `offset` by `limit` until the response contains fewer than `limit` profiles.

Example (local):

```
export CRON_SECRET=devsecret
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3002/api/traits/recompute/all?limit=50&offset=0"
```

` .github/workflows/traits-recompute.yml` already calls this endpoint nightly at 03:30 UTC. Add repo secrets:

1. `CRON_SECRET` – matches the deployed environment value.
2. `TRAITS_RECOMPUTE_ENDPOINT` – e.g. `https://your.app/api/traits/recompute/all`.

Adjust schedule/batch size inside the workflow file if needed.

#### Bangkok place tile warm (nightly)

- Endpoint: `POST /api/cron/places/bangkok?count=10`
- Warms 8–12 geohash tiles around central Bangkok (default `count=10`, max 20) so cached venue data stays hot.

Example local trigger:

```
export CRON_SECRET=devsecret
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3002/api/cron/places/bangkok?count=10"
```

#### Events ingest (every 3 hours)

- Endpoint: `POST /api/cron/events/run`
- Pulls all enabled sources from `event_sources`, normalises, dedupes, and upserts.

Example local trigger:

```
export CRON_SECRET=devsecret
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3002/api/cron/events/run"
```

For production scheduling, point your cron runner at the same endpoint and include the bearer token.

#### Manual seeding commands

Two pnpm helpers wrap the cron endpoints for local use. Both expect `CRON_SECRET` (and optionally `CRON_BASE_URL`) to be set.

```
export CRON_SECRET=devsecret
# Optional: export CRON_BASE_URL=https://staging.dowhat.app
pnpm seed:places:bangkok   # warms ~10 tiles via /api/cron/places/bangkok
pnpm seed:events:bangkok   # runs ingest once via /api/cron/events/run
```

Use these commands before demos to ensure real data for Bangkok appears in both web and mobile map listings.

Additional details on the event harvester live in `docs/events-ingestion.md` (source formats, tagging rules, etc.).

### Places layer overview

- Schema additions: `places`, `place_sources`, `place_request_metrics` (PostGIS enabled) with automatic TTL rollout (21–30 days) per place.
- Providers: OpenStreetMap (Overpass) + Foursquare persist to the catalogue; Google Places is optional at runtime (transient results only, never stored).
- Metrics: every API call logs cache hit/miss and latency p95 candidates into `place_request_metrics`.
- API endpoints:
  - `GET /api/places?sw=<lat,lng>&ne=<lat,lng>&categories=coffee,fitness` — viewport search with dedup + cache.
  - `GET /api/places/:id` — canonical place record plus provider snapshots.
- Frontend:
  - Web `/places` page renders the map + synchronized list with empty-state CTAs ("Create an activity at this place", "Suggest a place") and attribution for OSM/Foursquare.
  - Mobile adds a new tab (`Places`) with debounced viewport fetching, map markers, attribution banner, and the same empty-state CTAs.

## Deploy

Web (Vercel):

- Set env vars for the project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_EMAILS`
- Deploy with default Next.js settings

Mobile (EAS preview):

- Add an `eas.json` and ensure `EXPO_PUBLIC_SUPABASE_*` are set in your build profiles
- Build: `eas build -p ios` (and/or android)

## Contributing

- Typecheck before pushing: `pnpm --filter ./apps/doWhat-web exec tsc --noEmit && pnpm --filter ./apps/doWhat-mobile exec tsc --noEmit`
- Keep migrations alongside the app; apply in Supabase SQL editor.
