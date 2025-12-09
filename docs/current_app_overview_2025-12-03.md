# Current App Overview (2025-12-03)

## Monorepo Topology
- Expo/React Native mobile client in `apps/doWhat-mobile` with Supabase auth, map-centric discovery, saved activities, and session attendance flows powered by the `session_attendees` tables.
- Next.js 14 web client in `apps/doWhat-web` that mirrors discovery, activity detail, creation tools, and now an expanded admin dashboard.
- Shared TypeScript utilities under `packages/shared` (places ingestion, activity catalog, recommendations).
- Supabase SQL migrations tracked in `apps/doWhat-web/supabase/migrations` plus root-level helper scripts for seeding and health checks.

## Mobile Highlights
- **Map tab** shows city POIs fused from OSM/Foursquare. Place sheets display photos, metadata, and live session counts using `v_venue_attendance_summary`.
- **Map Save toggle** now pulls its payload from the shared `buildPlaceSavePayload` helper, layering the sheet’s venue/address overrides on top so bookmarking from the map mirrors every other Saved Activities surface.
- **Saved Activities** context lets authenticated users save/unsave venues or ad-hoc activities; optimistic updates keep UI snappy while Supabase stores `user_saved_activities` rows.
- **Home carousel** cards (“Popular nearby places”) now tap the same Saved Activities context, so members can Save/Saved those venues directly from the feed before hopping into the map or detail surfaces.
- **Nearby activities grid** on the Home screen now mirrors web parity with Save/Saved pills on each card, using linked session data to build payload metadata and letting people bookmark interesting activities without drilling into details first.
- **Upcoming sessions list** on the Home screen now embeds the Save/Saved pill on every card, building payloads from each session’s activity metadata (schedule, price, venue) so bookmarking future outings matches the rest of the parity rollout.
- **Saved tab** now consumes the shared Saved Activities provider, adds pull-to-refresh, and exposes the Save/Saved pill on every row so members can unsave items inline without navigating into detail pages first.
- **Session detail** pages now call the `/api/sessions/[id]/attendance` helper for counts/status/mutations, keeping attendee previews, badges, and capacity messaging consistent with the web client while Supabase realtime keeps things fresh, and they now ship the shared Save toggle so hosts/guests can bookmark the underlying activity directly from the detail view.
- **Activity detail** screens now mirror that Save toggle: the hero builds a payload from the primary upcoming session/venue so members can bookmark an activity without leaving the venue list, keeping parity with the web hero experience.
- **People filters** now hydrate the “Popular Personality Traits Nearby” grid from the real `/api/traits/popular` endpoint, so onboarding trait picks and post-session votes immediately shape the personalization hints shown in-app, and they display a banner that routes anyone with fewer than five saved vibes over to `/onboarding-traits` before applying filters.
- **Trait-based onboarding** screen now ships with the five-trait picker plus RN test coverage that exercises the selection cap, persistence RPC, and router redirect so Step 3 polish work starts from a regression-safe baseline. The Supabase trait policies were verified on 2025-12-04 via `node scripts/verify-trait-policies.mjs` after shipping migration 032 (vote guard + RPC privilege fix), and the full matrix now passes end-to-end.
- **Profile screen** surfaces Supabase-powered trait summaries and now shows a "Finish onboarding" banner when fewer than five vibes are locked in, linking straight to `/onboarding-traits` so members can complete their stack without hunting for the flow.
- **Trait onboarding reminder** logic now lives in `packages/shared/src/traits/onboardingReminder.ts`, so the mobile Profile banner, People Filter CTA, AuthGate onboarding guard, and their web counterparts all reference the same helper while Jest coverage confirms the CTA hides automatically once five traits are saved.

## Web Highlights
- **Discovery pages** (home, discover, nearby, activities) share search filters, trait chips, saved toggles, and attendance components with the mobile logic.
- **Session detail** mirrors the mobile attendee list, including host actions and badges, runs entirely on the `session_attendees` model, and now builds its Save/Saved toggle via the shared `buildSessionSavePayload` helper for telemetry parity.
- **Saved activities** now use the same context stack as mobile thanks to the shared `SavedActivitiesProvider`, so upcoming save/unsave UI can tap the unified helpers without reimplementing Supabase fallbacks; signed-out clicks automatically bounce to `/auth` instead of failing silently, so Save toggles always lead people toward finishing the action.
- **Activity cards & schedules** on the web now expose a Save/Saved toggle backed by the shared provider and build their payloads via the same helpers as mobile, giving discovery cards and the schedule board consistent metadata (sessions, venues, price labels) whenever someone bookmarks an activity.
- **Venue verification page** adds the same Save toggle to each list row and the detail drawer, and those payloads now run through `buildPlaceSavePayload` before layering AI confidence metadata so `/venues` stays in sync with every other place surface.
- **Map page** now surfaces the Save toggle on every nearby activity card and inside the on-map popup, so people can bookmark venues directly from either surface before deep-diving into details.
- **Places explorer** popups add the same Save toggle so curators can bookmark interesting POIs straight from the `/places` map without leaving the view.
- **Activity detail page** shows the Save toggle near the hero, reusing the shared helper to capture the primary session/venue metadata for each activity.
- **People filter** (web) shares the `/api/traits/popular` hints with mobile, replacing the static emoji list so the personalization module reflects live trait summary stats, and now surfaces a banner that nudges people with incomplete trait stacks over to `/onboarding/traits` before they start filtering.
- **Trait onboarding page** now lives at `/onboarding/traits`, gating access behind Supabase auth and embedding the shared `TraitSelector` so members can lock in their five base vibes on the web before jumping back to `/profile`.
- **Profile trait editor** embeds the new `TraitSelector`, letting members search the Supabase trait catalog, pick their five base vibes, and immediately refresh their profile summary without leaving `/profile`; a banner now nudges incomplete profiles toward `/onboarding/traits` to finish the five-trait stack.
- **TraitSelector regression tests** cover catalog loading, selection caps, and submission success paths to ensure the onboarding widget doesn’t regress as we keep iterating on Step 3.
- **Creation/Admin tooling**: `/admin/new`, `/admin/sessions`, `/admin/venues`, `/admin/activities` provide CRUD surface for staff plus utility APIs (traits recompute, cleanup, recommendations, cron). All admin routes gate access via the `NEXT_PUBLIC_ADMIN_EMAILS` allow list, and each list now ships with Save toggles so ops can bookmark noteworthy records mid-review. The activities and venues lists now include keyword search bars, match counts, and empty-state callouts so moderators can filter large catalogs without endless scrolling, and the dashboard metrics highlight last-7-day growth vs the prior week so ops can quickly spot momentum swings.
  - Those admin Save toggles now run through the same shared payload builders used on consumer surfaces, so telemetry remains consistent even when ops bookmark records from the dashboard.
- **NEW Admin dashboard (`/admin`)**
  - Authenticated admins view analytics cards (total users, sessions, venues, top activity categories) and can refresh live data.
  - Each card now surfaces how many records landed in the last seven days plus the delta vs the previous week, making growth trends visible without exporting data.
  - Inline tables show every session + venue with delete controls to remove inappropriate content.
  - Quick links jump to the detailed admin CRUD screens.
  - Session tables now support keyword filtering so ops can zero in on venues, activity titles, or IDs without scanning the entire catalog.

## Platform Services
- **Supabase** handles auth, row-level security, tables for venues, activities, sessions, session_attendees, saved activities, and trait telemetry.
- **Shared Save payload helpers** now live in `packages/shared/src/savedActivities`, so mobile and web surfaces derive consistent metadata (venue ids, schedule labels, pricing) for every Save/Saved pill without duplicating logic.
- Migration 033 drops the obsolete `event_participants` table and `rsvp_status` enum so only the session_attendees stack remains in the live schema (no more RSVP-era fallbacks lingering in Postgres).
- `pnpm health` now runs `scripts/health-env.mjs` and the Supabase trait policy verifier (`scripts/health-trait-policies.mjs`) before pinging `/api/health`, so Step 3 regressions surface automatically whenever the full health check runs (and it skips gracefully if Supabase credentials are absent).
- **Recommendation stack** combines saved traits, attendance history, and venue metadata via shared `packages/shared/src/places` + `apps/doWhat-web/src/lib/recommendations` modules.
- **Cron/API** endpoints exist for taxonomy seeding, event ingestion, health, and trait recompute.

## Outstanding Work / Risks
- SavedActivities parity now covers discovery/admin/map on web plus session detail, activity detail, top-places, nearby-activities, and the upcoming sessions list on mobile; next up is auditing any remaining feeds plus shoring up regression tests/telemetry for the shared helper.
- Trait onboarding flows now land on both clients with the shared trait catalog + onboarding RPC, the mobile picker has dedicated Jest coverage, and the Supabase RLS/RPC matrix passes via `scripts/verify-trait-policies.mjs`; remaining work is finishing any last UX polish.
- Session attendance migration now lands on both clients; the next roadmap slice focuses on Step 2 deliverables (host tools, notifications, and analytics that build on the unified `/api/sessions/[id]/attendance` stack).

This snapshot reflects the branch `feature/admin-dashboard-docs` after adding the analytics-capable admin dashboard on 2025-12-03, now with week-over-week growth deltas on the headline metrics.