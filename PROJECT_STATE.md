# doWhat — Project State (2025-12-18)

## 1) Repo Structure
- `/package.json`, `/pnpm-workspace.yaml`, `/pnpm-lock.yaml` — pnpm 9 workspace root; scripts such as `pnpm health`, `pnpm seed:dowhat`, `pnpm verify:dowhat`, and `pnpm run ci` orchestrate multi-package tasks.
- `apps/doWhat-web/` — Next.js 14 App Router web client (see `apps/doWhat-web/src/app`). Includes admin tooling, discovery pages, onboarding flows, Playwright config (`apps/doWhat-web/playwright.config.ts`), and Supabase migrations under `apps/doWhat-web/supabase/migrations/`.
- `apps/doWhat-mobile/` — Expo Router client (shared codebase for iOS/Android). Entry point `apps/doWhat-mobile/App.tsx`, tab screens in `apps/doWhat-mobile/src/app/(tabs)/`, onboarding hub at `apps/doWhat-mobile/src/app/onboarding/index.tsx`.
- `packages/shared/` — Cross-platform helpers (activity taxonomy, analytics, Saved Activities provider, recommendation math, reliability badges).
- `supabase/` — Local Supabase config (`supabase/config.toml`) and Edge Functions (`supabase/functions/{notify-sms,mobile-disputes,mobile-session-attendance}` plus `jest.config.js`).
- `scripts/` — Operational scripts (health checks, seeding, cron helpers, manual Twilio runner). Notable files: `scripts/health-*.mjs`, `scripts/seed-dowhat.mjs`, `scripts/verify-dowhat.mjs`, `scripts/rollback-dowhat.mjs`, `scripts/manual-notify-sms-run.mjs`.
- `docs/` — Product/engineering references, including `docs/current_app_overview_2025-12-03.md`, `docs/activity_discovery_overview.md`, `docs/dowhat_pilot_validation.md`, and migration notes.
- `apps/doWhat-web/tests/e2e/` — Playwright specs for admin/dashboard flows (Playwright server defaults to port 4302).
- `supabase/functions/notify-sms/schedule.sql` & `scripts/events-dry-run.cjs` etc. — Cron wiring & utility jobs.

## 2) What’s Implemented Today
- **Onboarding (traits, sport, pledge)**
  - Web: `apps/doWhat-web/src/app/onboarding/page.tsx`, `apps/doWhat-web/src/components/onboarding/*`, `apps/doWhat-web/src/components/profile/OnboardingProgressBanner.tsx`.
  - Mobile: `apps/doWhat-mobile/src/app/onboarding/index.tsx`, `apps/doWhat-mobile/src/app/__tests__/onboarding-index.test.tsx`, `apps/doWhat-mobile/src/components/OnboardingNavPrompt.tsx`.
- **Discovery & Save Flows**
  - Web home/discover/map pages under `apps/doWhat-web/src/app/(marketing|discover|map|people-filter)/`, Save toggles wired via `packages/shared/src/savedActivities`.
  - Mobile map & home hero: `apps/doWhat-mobile/src/app/(tabs)/map.tsx`, `apps/doWhat-mobile/src/app/(tabs)/home.tsx`, `apps/doWhat-mobile/src/components/FindA4thHero.tsx`.
- **Hosting/Admin Tools**
  - `/admin` dashboard & CRUD pages: `apps/doWhat-web/src/app/admin/{page.tsx,sessions/page.tsx,venues/page.tsx,activities/page.tsx,new/page.tsx}` plus Playwright coverage.
- **Attendance & Reliability**
  - Session detail & reliability pledge components on web (`apps/doWhat-web/src/app/sessions/[id]/page.tsx`, `apps/doWhat-web/src/components/onboarding/ReliabilityPledgeBanner.tsx`) and mobile (`apps/doWhat-mobile/src/app/(tabs)/sessions/[id].tsx`, `apps/doWhat-mobile/src/app/profile.simple.tsx`).
  - Reliability data served via Supabase functions (`supabase/functions/mobile-session-attendance`, `mobile-disputes`).
- **Notifications & Cron**
  - Host SMS pipeline via `supabase/functions/notify-sms`, `scripts/health-notifications.mjs`, PG cron schedule.
- **Activity ingestion**
  - Event cron handler `apps/doWhat-web/src/app/api/cron/events/run/route.ts` (called by `scripts/events-dry-run.cjs` and GH workflow `places-refresh`), taxonomy seeding (`scripts/seed-activity-taxonomy.mjs`, `packages/shared/src/taxonomy/activityTaxonomy.ts`).
- **Pilot toolkit**
  - Seed + verify + rollback scripts in `/scripts`, documented under `docs/dowhat_pilot_validation.md`.

## 3) Platform Status
### Web (Next.js)
- **What works**
  - Onboarding hub/routes, discovery pages, Save toggles, admin dashboard/CRUD, Playwright e2e when Next dev server runs on port 4302, notification health metrics, OG session previews.
- **What’s missing / broken**
  - Trait vote policy currently broken: `scripts/verify-trait-policies.mjs` fails because migration `apps/doWhat-web/supabase/migrations/032_trait_policy_guard_fix.sql` requires `public.rsvps` visibility but RLS exposes only self-owned rows, so `pnpm health` and `pnpm run ci` fail (see Known Issues).
  - `SUPABASE_DB_URL` not wired locally, so `scripts/health-migrations.mjs` & `scripts/health-notifications.mjs` skip by default.
- **How to run**
  - Dev: `pnpm --filter dowhat-web dev` (Next on port 3002; set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_EMAILS`).
  - Build: `pnpm --filter dowhat-web build && pnpm --filter dowhat-web start -p 3002`.
  - Tests: `pnpm --filter dowhat-web test -- --runInBand` (Jest), `PLAYWRIGHT_PORT=4302 pnpm --filter dowhat-web exec playwright test` (requires running dev server and admin allowlist).
- **Known issues**
  - `pnpm run ci` halts during `pnpm health` at `scripts/health-trait-policies.mjs` → “new row violates row-level security policy for table "user_trait_votes"”. Repro: `pnpm health` (needs Supabase env + service key).
  - Admin Playwright specs require `NEXT_PUBLIC_SUPABASE_*` env plus `NEXT_PUBLIC_ADMIN_EMAILS`; missing secrets cause Supabase auth errors.

### Mobile (Expo iOS/Android)
- **What works**
  - Expo Router tabs (Home, Map, Saved, Profile), onboarding banners/pill/prompt, reliability card, attendance dispute modal, Save toggles, Find-a-4th hero ranking.
  - RN Jest suite: `pnpm --filter doWhat-mobile test -- --maxWorkers=50%` (73 suites) passes locally.
  - `npx expo-doctor` reports 15/15 checks because repo is managed-only (native folders removed).
- **What’s missing / broken**
  - Same trait vote bug surfaces if mobile devs run `pnpm health` at root; mobile-only flows themselves are green.
  - Native builds require running `pnpm --filter doWhat-mobile exec expo prebuild --clean` on demand (ios/android folders ignored by default).
- **How to run**
  - Dev (both platforms): `pnpm --filter doWhat-mobile exec expo start -c` (Metro bundler, choose iOS simulator or Android emulator). Provide `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  - Tests: `pnpm --filter doWhat-mobile test -- --maxWorkers=50%`.
  - Typecheck: `pnpm --filter doWhat-mobile run typecheck`.
- **Known issues / platform notes**
  - For Expo Go/dev client: ensure `apps/doWhat-mobile/app.config.js` picks up `EXPO_PUBLIC_*` variables; missing values break Supabase auth.
  - iOS/Android builds require secrets for Supabase keys and push credentials; no EAS workflows committed yet.

## 4) Backend & Database (Supabase)
- **Key tables/views**
  - `users`, `profiles`, `activities`, `venues`, `sessions`, `session_attendees`, `session_open_slots`, `user_sport_profiles`, `user_trait_votes`, `user_trait_summary`, `user_base_traits`, `notification_outbox`, `traits`, `activity_categories`, `activity_taxonomy_state`.
  - Views: `v_session_attendance_counts`, `v_activity_attendance_summary`, `v_venue_attendance_summary`, `dowhat_adoption_metrics`, `v_activity_taxonomy_flat`.
- **Functions/Triggers**
  - `increment_user_trait_score`, `ensure_public_user_row`, `public.reliability_delta_for_status`, reliability trigger `session_attendance_reliability_trg` (migration `036_attendance_reliability_trigger.sql`).
  - `supabase/functions/mobile-session-attendance`: handles join/leave/listing via service-role logic for mobile clients.
  - `supabase/functions/mobile-disputes`: dispute submission/history for reliability flows.
  - `supabase/functions/notify-sms`: Twilio host SMS worker; PG cron job defined in `supabase/functions/notify-sms/schedule.sql` (requires `NOTIFICATION_*` vars and `CRON_SECRET`).
- **RLS**
  - Enabled on core tables (sessions, session_attendees, user traits, session_open_slots, notification_outbox). Policies rely on `auth.uid()` checks plus host ownership.
  - Known gap: `user_trait_votes_insert_guard` references `public.rsvps`, but `rsvps` table RLS (legacy) only exposes self rows. Need either to relax `rsvps` policies or revert guard to `session_attendees`.
- **Cron jobs / automation**
  - PG cron job for `notify-sms` (enqueues host SMS once per minute).
  - GitHub workflows `Nightly Places Refresh` (triggers `/api/places/refresh`) and `Nightly Trait Recompute` (calls `/api/traits/recompute/all`).
- **Seed + expectations**
  - `pnpm seed:dowhat` populates Bucharest pilot hosts/venues/sessions.
  - `pnpm verify:dowhat` checks Supabase rows (hosts, venues, activities, session open slots, host attendance) and is now part of `pnpm health`.
  - `pnpm rollback:dowhat` cleans pilot data.
  - `pnpm seed:taxonomy`, `pnpm seed:places:bangkok`, `pnpm seed:events:bangkok` support local data warm-up.

## 5) CI / GitHub Actions
- `.github/workflows/ci.yml` ("CI")
  - Triggers on push to `main`, `chore/**`, `feature/**` and PRs into `main`.
  - Steps: checkout → Node 20 + pnpm → `pnpm install --frozen-lockfile` → `pnpm run ci` (which chains workspace typecheck, lint, tests, builds, `pnpm --filter dowhat-web run build && start`, `pnpm health`).
  - **Status:** currently fails because `pnpm health` halts at `scripts/health-trait-policies.mjs` (trait vote RLS bug). Log excerpt: `users can vote for traits after a finished session with mutual attendance... new row violates row-level security policy for table "user_trait_votes"`.
- `.github/workflows/places-refresh.yml` ("Nightly Places Refresh")
  - Scheduled daily at 04:00 UTC + manual dispatch.
  - Posts to `${PLACES_REFRESH_ENDPOINT}` (default `https://dowhat.app/api/places/refresh`) with `CRON_SECRET`.
  - Status depends on external endpoint; no failing logs recorded locally.
- `.github/workflows/traits-recompute.yml` ("Nightly Trait Recompute")
  - Scheduled daily at 03:30 UTC + manual dispatch.
  - Runs `pnpm install --frozen-lockfile` then POSTs batched requests to `${TRAITS_RECOMPUTE_ENDPOINT}` with `CRON_SECRET`, iterating until processed < limit.
  - Requires `jq` inside runner; currently assumed green (no failing logs locally).

## 6) Health Checks & Verification Scripts
- `pnpm health` → `node scripts/health-env.mjs && node scripts/health-migrations.mjs --dowhat && node scripts/health-notifications.mjs && node scripts/health-trait-policies.mjs && node scripts/verify-dowhat.mjs && (curl -sf http://localhost:3002/api/health | jq .ok || true)`.
  - `scripts/health-migrations.mjs` and `scripts/health-notifications.mjs` now require `SUPABASE_DB_URL`/`DATABASE_URL` unless you explicitly export `MIGRATIONS_HEALTH_SKIP=1` or `NOTIFICATION_HEALTH_SKIP=1`, so health checks no longer skip silently when a database URL is missing.
  - Trait verification now succeeds once migration `044_trait_vote_guard_session_attendees.sql` is deployed; until each Supabase environment is updated you will continue to see the `user_trait_votes` RLS error noted in the verification step.
- Trait policy deep-dive: `node scripts/verify-trait-policies.mjs` (set `TRAIT_HEALTH_KEEP_DATA=true` to inspect seeded rows). Fails with the same RLS rejection.
- Onboarding regression pack: `pnpm test:onboarding-progress` (chains focused web and mobile Jest suites).
- doWhat verifier: `pnpm verify:dowhat` (also invoked inside `pnpm health`).
- Manual Twilio runner: `node scripts/manual-notify-sms-run.mjs` (requires `NOTIFICATION_ADMIN_KEY`, Twilio secrets, Supabase creds).
- Supabase CLI tasks: `pnpm dlx supabase functions deploy notify-sms --project-ref $SUPABASE_PROJECT_REF` (deploy), `pnpm dlx supabase login` (auth), `pnpm dlx supabase functions serve notify-sms` (local testing).

## 7) Environment Variables / Secrets (names only)
### Web (Next.js)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ADMIN_EMAILS`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `FOURSQUARE_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `OVERPASS_API_URL`
- `CRON_SECRET`
- `NOTIFICATION_ADMIN_KEY`
- `POSTHOG_KEY`
- `SENTRY_DSN`
- `NOTIFICATION_TWILIO_STUB`
- `NOTIFICATION_TWILIO_STUB_TO`

### Mobile (Expo)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_WEB_PORT` (optional for linking to web dev server)

### Supabase / Scripts
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY` (legacy alias)
- `SUPABASE_DB_URL` or `DATABASE_URL`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `DOWHAT_SEED_PASSWORD`
- `DOWHAT_HEALTH_SKIP` (temporary health bypass)
- `MIGRATIONS_HEALTH_SKIP`
- `NOTIFICATION_HEALTH_SKIP`
- `TRAIT_HEALTH_SKIP`
- `TRAIT_HEALTH_KEEP_DATA`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `NOTIFICATION_TWILIO_STUB`
- `NOTIFICATION_TWILIO_STUB_TO`
- `EVENT_INGEST_USER_AGENT`
- `CRON_SECRET`
- `PLACES_REFRESH_ENDPOINT`
- `TRAITS_RECOMPUTE_ENDPOINT`
- `FSQ_API_KEY`
- `OVERPASS_URL`

### CI / GitHub Secrets
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CRON_SECRET`
- `PLACES_REFRESH_ENDPOINT`
- `TRAITS_RECOMPUTE_ENDPOINT`

## 8) Known Risks / Tech Debt (priority order)
1. **Trait vote RLS rollout** — migration `044_trait_vote_guard_session_attendees.sql` must be applied everywhere to restore trait voting; environments without it still reject legitimate votes and will block `pnpm health`.
2. **Health DB credentials** — `scripts/health-migrations.mjs` and `scripts/health-notifications.mjs` now require `SUPABASE_DB_URL`/`DATABASE_URL` (or explicit skip flags). CI and developer machines need the secret wired up to avoid hard failures.
3. **Twilio production creds not present locally**; `notify-sms` currently runs in stub mode, so real SMS path unverified outside production.
4. **Admin Playwright env coupling** — tests require injecting Supabase keys + admin emails; lacking secrets causes false failures.
5. **Expo native builds** — ios/android folders removed; EAS instructions documented but not automated; risk when prepping App Store/Play submissions.
6. **Cron endpoints rely on plain bearer secrets** (`CRON_SECRET`); rotating secrets requires manual updates in multiple places (GH workflows, Supabase schedules, CLI scripts).
7. **Notification outbox health coverage** — now that the script enforces DB presence, ensure every environment provides the URL (or sets `NOTIFICATION_HEALTH_SKIP`) so stale rows surface instead of breaking the pipeline.
9. **Mapbox + Overpass quota** — keys live in developer envs but not rotated automatically; outage would break map surfaces.
10. **Manual trait/test data** — `pnpm seed:dowhat` assumes Bucharest dataset; running against other regions requires editing hardcoded constants in `scripts/dowhat-shared.mjs`.

## 9) Next Steps (2-week plan)
### Must-fix before pilot
1. **Deploy trait vote migration** — apply `044_trait_vote_guard_session_attendees.sql` everywhere so trait voting and `scripts/verify-trait-policies.mjs` pass again.
2. **Re-run `pnpm health` + `pnpm run ci`** after the migration; capture outputs in `ASSISTANT_CHANGES_LOG.md` and README.
3. **Wire `SUPABASE_DB_URL` into local/dev secrets** so `scripts/health-migrations.mjs` and `scripts/health-notifications.mjs` execute end-to-end.
4. **Document Twilio production secret rotation** (supabase/config + GH secrets) and run `node scripts/manual-notify-sms-run.mjs` against staging with real credentials.
5. **Playwright env template** — add `.env.playwright.example` (NEXT_PUBLIC_SUPABASE_*, NEXT_PUBLIC_ADMIN_EMAILS) and update `README.md` with `PLAYWRIGHT_PORT=4302 pnpm --filter dowhat-web exec playwright test` workflow.
6. **Pilot seed audit** — run `pnpm seed:dowhat && pnpm verify:dowhat` against staging DB, publish results in `docs/dowhat_pilot_validation.md`.
7. **CI badge + alerting** — fix trait policy, then ensure `.github/workflows/ci.yml` passes on latest commit; enable branch protection gating on CI success.

### Nice-to-have
8. **Automate Expo native builds** — add EAS workflow docs/scripts and verify `expo prebuild` output.
9. **Mapbox fallback** — implement offline or static map fallback for web/mobile when Mapbox tokens missing.
10. **Cron secret rotation tooling** — add `scripts/rotate-cron-secret.mjs` and doc to propagate secrets to Supabase vault + GH actions.
11. **Health dashboard** — expose `/api/health` detail page showing migration + trait status to avoid digging through CLI logs.
12. **Notification metrics panel** — add `apps/doWhat-web/src/app/admin/notifications/page.tsx` summarizing `notification_outbox` backlog/failures.
13. **Edge function tests** — extend `supabase/functions/notify-sms/__tests__/twilio.test.ts` with real Twilio sandbox cassettes.
14. **Map caching metrics** — log `place_request_metrics` in admin to monitor Overpass/Foursquare latency spikes.
