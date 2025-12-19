# doWhat — Web + Mobile (Expo) with Supabase

This monorepo contains a Next.js web app and an Expo (React Native) mobile app that share a tiny utilities package. Supabase powers auth and data (sessions, session_attendees, profiles, venues, activities) and we use Postgres RPC for nearby search.

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
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY # optional alias consumed by legacy scripts
```

Root scripts automatically call `scripts/utils/load-env.mjs`, so the Supabase credentials above can live in `.env.local` or `.env` without exporting them every time.

### Health + verification scripts

`pnpm -w run health` stitches together env validation, migration checks, `health-trait-policies`, `/api/health`, and the doWhat verifier. Those commands now fail fast unless the root env file exposes:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`)
- `SUPABASE_DB_URL` (or `DATABASE_URL`)

Optional helpers:

- `DOWHAT_SEED_PASSWORD` – deterministic passwords when seeding hosts
- `DOWHAT_HEALTH_SKIP=true` – temporarily bypass the doWhat verifier (only while a target environment intentionally omits the seed)
- `MIGRATIONS_HEALTH_SKIP=true` – explicitly bypass migration ledger checks when a database isn’t available
- `NOTIFICATION_HEALTH_SKIP=true` – explicitly bypass notification outbox checks when a database isn’t available

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

Notification engine (Supabase Edge Function `notify-sms`):

```
SUPABASE_URL=...                    # already required for scripts/health
SUPABASE_SERVICE_ROLE_KEY=...       # already required for scripts/health
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=super_secret
TWILIO_FROM_NUMBER=+15551234567
NOTIFICATION_ADMIN_KEY=devsecret    # shared bearer token for manual triggers
NOTIFICATION_BATCH_SIZE=20          # optional overrides
NOTIFICATION_MAX_ATTEMPTS=3
NOTIFICATION_SESSION_WINDOW_MINUTES=60
NOTIFICATION_SESSION_MAX_PER_WINDOW=5
NOTIFICATION_TWILIO_STUB=false      # set true locally to skip real Twilio calls
NOTIFICATION_TWILIO_STUB_TO=+15005550006
```

The Twilio vars live wherever Supabase Edge Functions run (local `supabase functions serve` or prod env). `NOTIFICATION_ADMIN_KEY` secures the HTTP endpoint when triggered manually or via cron.
`pnpm health` now surfaces the same keys as required via `scripts/health-env.mjs`, so local/staging runs will fail fast if any Twilio credential is missing.

Disable the default JWT requirement for this function with the checked-in `supabase/config.toml`:

```
[functions."notify-sms"]
verify_jwt = false
```

This tells Supabase to trust the bearer key you pass in `Authorization` rather than enforcing a Supabase auth token—required for pg_cron and other non-user triggers.

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

### E2E bypass guardrail

- Append `?e2e=1` to any admin URL during local/dev runs to auto-enable a temporary bypass (production still requires `NEXT_PUBLIC_E2E_ADMIN_BYPASS=true`).
- Playwright automatically injects `NEXT_PUBLIC_ADMIN_EMAILS` into the dev server (via `playwright.config.ts`) so the mocked Supabase auth session matches the allow list without touching `.env.local`.

#### Playwright env template

1. Copy the sample file: `cp .env.playwright.example .env.playwright.local`.
2. Edit `.env.playwright.local` with your Supabase project values:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_ADMIN_EMAILS` (comma-separated allow list)
3. Run the e2e pack with the dedicated port so it does not clash with `pnpm dev`:

```
PLAYWRIGHT_PORT=4302 pnpm --filter dowhat-web exec playwright test
```

The root `playwright.config.ts` loads `.env.playwright.local` automatically (falling back to legacy `.env.e2e*` files) and forwards the values to the dev server started for the tests.

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

After migrations run, you can double-check that required files landed by executing the health script:

```
node scripts/health-migrations.mjs               # verifies 025–034 (core migrations)
node scripts/health-migrations.mjs --dowhat      # extends the check through 034a–037
```

The `--dowhat` flag now also confirms the doWhat adoption view plus the notification outbox migration/table required for the Twilio SMS engine (the legacy `--social-sweat` alias still works but prints a deprecation warning).

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

#### notify-sms (every minute)

- Location: `supabase/functions/notify-sms/schedule.sql`
- Store the Supabase project URL + `NOTIFICATION_ADMIN_KEY` inside Vault (`vault.create_secret`) before running the script.
- Apply the job with `psql "$SUPABASE_DB_URL" -f supabase/functions/notify-sms/schedule.sql` (or through the SQL editor). The file wraps `cron.schedule` + `net.http_post` to call the Edge Function once per minute with the bearer token.
- Update the cron expression or job name in the SQL file if you need a different cadence.
- For local dry runs set `NOTIFICATION_TWILIO_STUB=true` (and, optionally, override `NOTIFICATION_TWILIO_STUB_TO`) so the Edge Function logs payloads instead of contacting Twilio; the health script treats Twilio credentials as optional when the stub flag is on.
- `pnpm health` now includes `scripts/health-notifications.mjs`, which checks for stale pending rows and recent failures inside `notification_outbox` so cron/Twilio issues show up alongside the existing migration + doWhat checks.
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

## Troubleshooting

### Mobile onboarding prompt says “Could not load onboarding progress”

1. Confirm the Next.js API is running locally (`pnpm --filter doWhat-web dev`). The mobile app uses the API for health checks + geocode helpers, so Expo needs a reachable server on port `3002` (or the port set in `EXPO_PUBLIC_WEB_PORT`).
2. Hit `curl http://localhost:3002/api/health` while the server is running. If the JSON payload reports missing tables such as `user_traits`, your local Supabase instance still lacks the required migrations.
3. Apply migrations against the database backing your Supabase project:
  ```sh
  export SUPABASE_DB_URL=postgres://user:pass@host:5432/postgres
  node run_migrations.js
  # or pnpm db:migrate (wrapper)
  ```
  Re-run the health endpoint until the `missing` array is empty.
4. Reload the Expo bundle. `useOnboardingProgress` will now hydrate trait/sport/pledge status without throwing, and the card should either list the pending steps or hide itself if onboarding is done.

React Native treats `console.error` calls as fatal redboxes, so we intentionally downgraded onboarding fetch failures to `console.warn`. Expect a yellow-box log if Supabase is still unreachable, but the app will stay usable.

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

#### Host SMS notifications (every 5 minutes)

- Edge Function: `POST https://<project>.functions.supabase.co/notify-sms`
- Purpose: poll `notification_outbox` for `attendee_joined` events, send Twilio SMS to hosts, mark rows sent/failed.

Example local trigger (requires Supabase CLI `supabase functions serve notify-sms` running or a deployed function):

```
export NOTIFICATION_ADMIN_KEY=devsecret
curl -X POST \
  -H "Authorization: Bearer $NOTIFICATION_ADMIN_KEY" \
  http://localhost:54321/functions/v1/notify-sms
```

Production: configure a Supabase Scheduled Function (recommended) or your existing cron runner to call the deployed URL every 5 minutes with the same bearer token. The batch size, attempts, and rate window are controlled via the environment variables documented above.

Manual verification helper:

```
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
NOTIFICATION_ADMIN_KEY=... \
node scripts/manual-notify-sms-run.mjs
```

The script seeds a pending `notification_outbox` row (using the Twilio stub recipient) and pings the deployed Edge Function. It prints the selected session/attendee, the notify-sms response, and the final row state. If the function isn’t deployed to your Supabase project yet you’ll receive a 404; the script automatically cleans up the seeded rows so the queue stays empty.

Deployment checklist:

1. Install (or upgrade) the Supabase CLI: `pnpm dlx supabase@latest --version`.
2. Authenticate: `pnpm dlx supabase login` (opens a browser window, saves the access token locally).
3. Set the project ref for the environment you’re targeting (e.g., `kdviydoftmjuglaglsmm`):
  ```
  export SUPABASE_PROJECT_REF=kdviydoftmjuglaglsmm
  export SUPABASE_ACCESS_TOKEN=... # optional if not stored already
  ```
4. Deploy the Edge Function:
  ```
  pnpm dlx supabase functions deploy notify-sms --project-ref "$SUPABASE_PROJECT_REF"
  ```
  The command uploads `supabase/functions/notify-sms` and shares the public invocation URL. Make sure the project’s environment variables (`TWILIO_*`, `NOTIFICATION_ADMIN_KEY`, stub flags) are already configured in Supabase.
5. Verify the deployment via `node scripts/manual-notify-sms-run.mjs` (or `curl` directly) before wiring the pg_cron schedule. Expect a JSON response such as `{ processed: 1, outcomes: [{ id: ..., status: "sent" }] }` when the stub Twilio run succeeds.

#### Manual seeding commands

Two pnpm helpers wrap the cron endpoints for local use. Both expect `CRON_SECRET` (and optionally `CRON_BASE_URL`) to be set.

```
export CRON_SECRET=devsecret
# Optional: export CRON_BASE_URL=https://staging.dowhat.app
pnpm seed:places:bangkok   # warms ~10 tiles via /api/cron/places/bangkok
pnpm seed:events:bangkok   # runs ingest once via /api/cron/events/run
pnpm seed:dowhat           # provisions Bucharest pilot data (profiles, venues, sessions, open slots)
pnpm rollback:dowhat       # removes the Bucharest pilot data (sessions/venues/activities/profiles/auth users)
```

`seed:dowhat` talks directly to Supabase (no cron endpoint). Provide `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`), and `SUPABASE_ANON_KEY` via exports or the root `.env.local`/`.env` (the script now loads them automatically). Optionally set `DOWHAT_SEED_PASSWORD` to force a deterministic password for newly created pilot users. The script:

- Ensures the Bucharest pilot hosts exist in Supabase auth and the mirrored `users` table, creating accounts when missing and echoing their credentials at the end of the run.
- Upserts the matching `profiles`, `user_sport_profiles`, venues, activities, and sessions tied to the doWhat pilot seed tag.
- Inserts matching `session_open_slots` rows, so the Find a 4th player carousel immediately has ranked inventory after a mobile refresh.
- Runs a post-seed verification pass to confirm every host has profile + user rows and each seeded session still points at the expected host (the same invariants `pnpm health` enforces).

Follow up with `pnpm verify:dowhat` (same env vars) to confirm the hosts, venues, activities, sessions, open-slot rows, and host attendance records exist before running demos.

If the seed fails because `auth.admin.createUser` returns a 500 and logs `new row violates row-level security` or `null value in column "user_id" of relation "profiles"`, the Supabase project is missing migration `040_profiles_handle_new_user.sql`. Re-run `pnpm db:migrate` (with `SUPABASE_DB_URL` set) to apply the migration so the trigger writes the `user_id` column before reseeding.

Need to run health or verification commands before the doWhat seed is ready? Set `DOWHAT_HEALTH_SKIP=true` in the same shell (e.g. `DOWHAT_HEALTH_SKIP=true pnpm health`) to temporarily bypass the verifier without editing code. Only rely on the skip flag while staging environments or CI intentionally omit the Bucharest pilot data.

### Session share previews (Open Graph)

- Every session page (`/sessions/[id]`) now exposes dynamic Open Graph + Twitter metadata via `generateMetadata` plus a dedicated OG image endpoint at `/sessions/[id]/opengraph-image`. The ImageResponse renders the doWhat gradient, remaining slot count, required skill label, venue, host, and start time so WhatsApp/iMessage previews highlight exactly what the host still needs.
- Sharing a session link automatically hits the same metadata. To verify manually, open `http://localhost:3002/sessions/<id>/opengraph-image` (replace `<id>` with a real session UUID or one from `pnpm seed:dowhat`). The PNG output should show the sport name, slot pill, venue, host, and time on the emerald gradient.
- When testing on WhatsApp or Slack, make sure the dev server is publicly accessible (e.g., via `ngrok http 3002`) so the crawler can fetch both the HTML metadata and the OG route. No authentication is required for the image endpoint, so avoid leaking private sessions outside trusted tunnels.

Need to tear the pilot data down? Run `pnpm rollback:dowhat` with the same Supabase env vars. It deletes the seeded sessions, open slots, venues, activities, sport profiles, profiles, and the host auth users so you can reseed from scratch.

See `docs/dowhat_pilot_validation.md` for the full pilot validation checklist (env vars, seeding, mobile/web verification, and troubleshooting steps).

Use these commands before demos to ensure real data for Bangkok appears in both web and mobile map listings.

Additional details on the event harvester live in `docs/events-ingestion.md` (source formats, tagging rules, etc.).

### Session attendance views

Migration `030_attendance_views.sql` introduces helper views so both web and mobile clients can query consolidated counts without bespoke aggregation logic:

- `v_session_attendance_counts` — going/interested/declined counts per session plus the last response timestamp.
- `v_activity_attendance_summary` — roll-up of total/upcoming sessions and attendance counts per activity.
- `v_venue_attendance_summary` — the same roll-up grouped by venue.

Expose these views through Supabase RPC or REST when you need attendee totals for discovery cards, places/venue detail screens, or admin analytics.

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

### Saved Activities regression checks

Run both Saved Activities context suites whenever you touch the shared payload builders, Supabase views, or telemetry wiring:

```
pnpm --filter dowhat-web test -- SavedActivitiesContext
pnpm --filter doWhat-mobile test -- SavedActivitiesContext
```

These suites cover optimistic save/unsave flows, fallback reads when Supabase views misbehave, and `trackSavedActivityToggle` telemetry. Pair them with `pnpm health` (env wiring, migrations, trait policies, doWhat verifier, `/api/health`) before committing so Saved Activities changes always ride on a verified schema.

### Trait onboarding validation

Before merging Step 3 edits (traits onboarding/profile flows, RPC/policy tweaks), rerun the core regression suites and policy verifier:

```
pnpm --filter dowhat-web test -- app/onboarding/__tests__/page.test.tsx app/profile/__tests__/page.test.tsx app/people-filter/__tests__/page.test.tsx
pnpm --filter doWhat-mobile test -- onboarding-traits profile.simple.cta people-filter
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-trait-policies.mjs
```

The Jest suites cover the shared TraitSelector, profile banners/CTAs, and people-filter reminders on both platforms. The verification script runs the RLS matrix from `docs/trait_policies_test_plan.md`; run it against a local or staging Supabase instance whenever policies or onboarding RPCs change, and capture the output in your PR description.

### Onboarding progress regression checks

After editing the Step 0 progress banner, nav CTA, or onboarding hub, rerun the focused Jest suites that guard the prioritized CTA routing and telemetry payloads. Run everything at once via:

```
pnpm test:onboarding-progress
```

Or trigger the suites individually:

```
pnpm --filter dowhat-web test -- OnboardingProgressBanner apps/doWhat-web/src/app/people-filter/__tests__/page.test.tsx
pnpm --filter doWhat-mobile test -- onboarding-index profile.simple.cta OnboardingNavPrompt OnboardingNavPill people-filter
```

The web suites keep both the profile banner copy/pills and the People Filter CTA telemetry aligned with the shared onboarding metadata. The mobile suites cover the profile banner nudges, the `/onboarding` hub summary card, the home nav prompt, the floating tab CTA, and the People Filter reminders so every Step 0 entry fires the correct telemetry payload.
