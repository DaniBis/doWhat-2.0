# Current App Overview (2025-12-03)

## Monorepo Topology
- Expo/React Native mobile client in `apps/doWhat-mobile` with Supabase auth, map-centric discovery, saved activities, and session attendance flows powered by the `session_attendees` tables.
- Next.js 14 web client in `apps/doWhat-web` that mirrors discovery, activity detail, creation tools, and now an expanded admin dashboard.
- Shared TypeScript utilities under `packages/shared` (places ingestion, activity catalog, recommendations).
- Supabase SQL migrations tracked in `apps/doWhat-web/supabase/migrations` plus root-level helper scripts for seeding and health checks.

## Mobile Highlights
- **Map tab** shows city POIs fused from OSM/Foursquare. Place sheets display photos, metadata, and live session counts using `v_venue_attendance_summary`.
- **Saved Activities** context lets authenticated users save/unsave venues or ad-hoc activities; optimistic updates keep UI snappy while Supabase stores `user_saved_activities` rows.
- **Session detail** pages use `session_attendees` to show who’s going, attendance caps, host tools, and real-time status.
- **Trait-based onboarding** scaffolding exists (contexts + API hooks) to align upcoming personalization work, even though client UIs are still in-progress.

## Web Highlights
- **Discovery pages** (home, discover, nearby, activities) share search filters, trait chips, saved toggles, and attendance components with the mobile logic.
- **Session detail** mirrors the mobile attendee list, including host actions, badges, and RSVP-to-attendance migration.
- **Creation/Admin tooling**: `/admin/new`, `/admin/sessions`, `/admin/venues`, `/admin/activities` provide CRUD surface for staff plus utility APIs (traits recompute, cleanup, recommendations, cron). All admin routes gate access via the `NEXT_PUBLIC_ADMIN_EMAILS` allow list.
- **NEW Admin dashboard (`/admin`)**
  - Authenticated admins view analytics cards (total users, sessions, venues, top activity categories) and can refresh live data.
  - Inline tables show every session + venue with delete controls to remove inappropriate content.
  - Quick links jump to the detailed admin CRUD screens.

## Platform Services
- **Supabase** handles auth, row-level security, tables for venues, activities, sessions, session_attendees, saved activities, and trait telemetry.
- **Recommendation stack** combines saved traits, attendance history, and venue metadata via shared `packages/shared/src/places` + `apps/doWhat-web/src/lib/recommendations` modules.
- **Cron/API** endpoints exist for taxonomy seeding, event ingestion, health, and trait recompute.

## Outstanding Work / Risks
- Typecheck currently fails inside `apps/doWhat-mobile/src/contexts/SavedActivitiesContext.tsx` (index signature issues) — impacts CI.
- Trait onboarding UI is still underway (APIs exist but flows not fully wired on either client).
- Session RSVP deprecation continues on web — some legacy components (`RsvpQuickActions`, etc.) still reference the old API and need migration to `session_attendees` joins.

This snapshot reflects the branch `feature/admin-dashboard-docs` after adding the analytics-capable admin dashboard on 2025-12-03.