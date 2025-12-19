# Activity Discovery & Geolocation Overview (2025-12-18)

This document captures how doWhat currently ingests activities, stores geospatial data, and exposes discovery experiences across web and mobile after syncing with `main`.

## 1. Data & Schema Layers
- **Supabase Postgres** is the source of truth for everything surfaced to members:
  - `activities`, `venues`, `sessions`, `session_attendees`, `session_open_slots`, `user_sport_profiles`, and `notification_outbox` cover live inventory + host workflow.
  - Views such as `v_activity_taxonomy_flat`, `v_session_attendance_counts`, `v_activity_attendance_summary`, and `v_venue_attendance_summary` power analytics-heavy UI (map popups, admin dashboards, reliability cards).
  - `activity_taxonomy_state` + `activity_categories` keep the curated taxonomy versioned so both clients and ingestion jobs stay in sync.
- **Shared helpers (`packages/shared`)** expose taxonomy, recommendation, Saved Activities, analytics, and geospatial utilities so Expo + Next rely on the same payload builders and telemetry.
- All schema changes live under `apps/doWhat-web/supabase/migrations`, enforced by `pnpm health` (env validation, `scripts/health-migrations.mjs --dowhat`, notifications health, trait-policy verifier, Bucharest pilot verifier, `/api/health`).

## 2. Activity Supply & Enrichment
1. **Manual & admin-created sessions**
   - `/admin/new` lets staff add curated sessions, open slots, and manual coordinates. Publishing triggers `session_open_slots` inserts plus `trackSessionOpenSlotsPublished` telemetry with manual-entry + geo flags.
   - Ops can prefill forms via query params or plan-again links from `/admin/sessions`, `/admin/venues`, and discovery cards.
2. **doWhat pilot seed**
   - `pnpm seed:dowhat` provisions Bucharest pilot data (hosts, venues, activities, sessions, `session_open_slots`, sport profiles). `pnpm verify:dowhat` then checks the seed invariants before demos.
   - `pnpm rollback:dowhat` removes the same records so environments can reseed cleanly.
3. **Event ingestion pipeline** (`docs/events-ingestion.md`)
   - `POST /api/cron/ingest-events` fetches enabled sources (ICS, RSS, JSON-LD), normalizes events, matches venues, and upserts into `events`/`sessions`.
   - `CRON_SECRET` + `EVENT_INGEST_USER_AGENT` guard the endpoint; schedulers invoke it every ~3 hours.
4. **Places & venue seeding**
   - `pnpm seed:places:bangkok` warms ~10 geohash tiles around Bangkok via `/api/cron/places/bangkok`. `pnpm seed:events:bangkok` hydrates curated events for that city.
   - `seed:taxonomy` syncs the shared taxonomy into Postgres so all ingestion paths share IDs/labels.
5. **Trait & reliability metadata**
   - Trait catalog + onboarding RPCs ensure members have at least five vibes; `user_trait_votes` and `user_trait_summary` keep post-session voting ready for personalization.
   - Reliability tracking relies on `session_attendees` (checked-in + `attendance_status`) plus the pledge acknowledgement stored on profiles.

## 3. Discovery Surfaces & Logic
### Web (Next.js, `apps/doWhat-web`)
- **Home/discover/search/activity detail** reuse shared query helpers that now pull `host_user_id` (not the retired `created_by` column).
- **Saved Activities**: every Save/Saved pill runs through `SavedActivitiesProvider` + `build*SavePayload` helpers, ensuring consistent Supabase mutations and telemetry.
- **People Filter**: fetches `/api/traits/popular`, enforces onboarding completion (traits + pledge), and emits `trackOnboardingEntry` with the full pending-step array.
- **Map & Places explorer**: `GET /api/places?sw=<lat,lng>&ne=<lat,lng>&categories=…` streams viewport data. Popups list live sessions via `v_venue_attendance_summary`, show Save toggles, and deep-link into activities/venues.
- **Session pages**: combine attendance list, Save pill, OG preview image, and session share metadata so WhatsApp/iMessage crawlers highlight open slots + host info.
- **Admin dashboard**: surfaces week-over-week metrics plus doWhat readiness using `dowhat_adoption_metrics` view; quick actions jump into CRUD screens.

### Mobile (Expo Router, `apps/doWhat-mobile`)
- **Home hero + carousel**: uses `rankSessionsForUser` and `normalizeRankingScore` to recommend `session_open_slots` ("Looking for Players"), logging impression/engagement events before routing to session detail.
- **Map tab**: renders OSM/Foursquare-fused POIs, uses Supabase `venues` + `v_venue_attendance_summary` for live counts, and shares Save toggles with web. The map sheet shows metadata, photos, and next sessions.
- **People Filter / Profile**: identical onboarding enforcement + telemetry; profile adds Step 0 progress banner, reliability card, attendance log screen, and dispute history tied to Supabase Edge functions.
- **Saved tab & activity detail**: share the Saved Activities context so members can bookmark from anywhere.
- **Session detail**: loads attendance via `/api/sessions/[id]/attendance`, exposes dispute modal, reliability badges, Save toggle, and Twilio notification hooks (via `notification_outbox`).

## 4. Geolocation & Search Pipeline
1. **Data acquisition**
   - `places`, `place_sources`, and `place_request_metrics` store fused POIs (primary from OpenStreetMap/Overpass + Foursquare, optional Google Places fallback at runtime).
   - `seed:places:bangkok` + nightly cron warms geohash tiles for high-priority cities so caches stay hot.
2. **APIs**
   - `GET /api/places` accepts SW/NE bounds plus category filters; dedupes overlapping providers, merges metadata/images, and returns venues + sessions in view.
   - `GET /api/places/:id` exposes canonical records with provider snapshots.
   - Session discovery uses bounding boxes + trait/activity filters to pull `sessions` joined with `venues` + `activities`. The shared helpers emit analytics events for filter toggles and Save actions.
3. **Ranking & personalisation**
   - `rankSessionsForUser` scores open slots using attendance history, saved traits, and location proximity.
   - Activity taxonomy tags (Tier3 IDs + synonyms) feed ingestion, manual curation, and analytics so surfaces can cluster sports/categories consistently.
4. **Telemetry**
   - `place_request_metrics` logs API hits (cache vs fresh, latency) to monitor provider performance.
   - `trackTaxonomy*`, `trackOnboardingEntry`, `trackSessionOpenSlotsPublished`, and Saved Activity events ensure both clients report how users reach activities.

## 5. Background Jobs & Commands
| Purpose | Command / Endpoint | Notes |
| --- | --- | --- |
| Warm Bangkok place tiles | `pnpm seed:places:bangkok` | Calls `/api/cron/places/bangkok?count=10` with `CRON_SECRET`.
| Seed Bangkok events | `pnpm seed:events:bangkok` | Hits `/api/cron/events/run` once.
| Ingest global sources | `curl -X POST -H "x-cron-secret" https://…/api/cron/ingest-events` | Runs every 3 hours in prod.
| Seed taxonomy | `pnpm seed:taxonomy` | Syncs shared taxonomy file to Postgres tables/views.
| Pilot data | `pnpm seed:dowhat` / `pnpm verify:dowhat` / `pnpm rollback:dowhat` | Creates/validates/removes Bucharest pilot inventory.
| Health sweep | `pnpm health` | Env → migrations (`--dowhat`) → notifications → trait policies → doWhat verifier → `/api/health` ping.
| Manual Twilio dry run | `node scripts/manual-notify-sms-run.mjs` | Seeds `notification_outbox`, invokes Supabase Edge `notify-sms`, cleans test rows.

## 6. How Geolocation Impacts UX
- **Viewport-driven queries** mean both apps only fetch venues/sessions inside the visible map bounds, cutting bandwidth and letting caches stay city-specific.
- **Geohash tile warming** keeps high-interest areas (Bangkok/Bucharest) cached so first renders avoid cold Overpass/Foursquare calls.
- **Session open slots** always carry coordinates; `session_open_slots` table enforces host ownership via RLS, and the admin create form records manual-entry flags so ranking algorithms can treat imprecise data differently.
- **Place saves & recommendations** rely on consistent lat/lng + taxonomy tags so Saved Activities, Find-a-4th, and admin reviews all point to the same canonical venue.
- **Notification targeting** (Twilio host SMS) uses venue/session coordinates to annotate payloads and apply per-session/hour limits before enqueuing to `notification_outbox`.

## 7. Validation & Testing Hooks
- Run `pnpm test:onboarding-progress` to cover all Step 0 CTAs (web + mobile) whenever onboarding logic changes.
- Use `pnpm --filter dowhat-web exec playwright test` (defaults to port 4302) to exercise admin CRUD, discovery flows, and the health endpoint under real browsers.
- `pnpm --filter doWhat-mobile test -- --maxWorkers=50%` keeps the Expo suite (map, home hero, reliability, disputes, onboarding) green; `npx expo-doctor` confirms managed-only integrity.
- `node scripts/verify-trait-policies.mjs` (with Supabase creds) ensures trait votes, base trait storage, and summary RPCs respect RLS even after schema tweaks; set `TRAIT_HEALTH_KEEP_DATA=true` when you need to inspect generated rows before cleanup.

With these layers in place, both clients can reliably surface nearby activities, highlight open slots that match a member’s skills and traits, and keep the underlying geospatial data synchronized across ingestion jobs, manual admin edits, and Saved Activity workflows.
