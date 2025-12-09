# Reference Snapshot — Commit 0ae969c (2025-12-01)

This document captures the state of `main` three days ago (commit `0ae969ceb7e6402b5b4fa16b83db450d8768b507`, message: *"Polish discovery pages and ESLint setup"*).

## High-Level Architecture
- Monorepo with Next.js App Router web client (`apps/doWhat-web`), Expo Router mobile client (`apps/doWhat-mobile`), and shared helpers under `packages/shared`.
- Supabase backs auth plus core tables: sessions, RSVPs (legacy), profiles, venues, activities. Nearby search endpoints rely on Postgres RPC functions per README guidance.
- Tooling documented in `README.md` already describes env requirements (Node 20+, pnpm 9+, Supabase keys) and cron helpers for traits recompute, place warming, events ingestion, and taxonomy seeding.

## Web Application State
- Discovery surface (home, discover, nearby, activities) recently polished per commit message—UI tweaks + ESLint cleanup but no new data domains.
- Session detail pages still lean on the RSVP API; `session_attendees` views had not yet replaced `apps/doWhat-web/src/components/Rsvp*` usages (the current feature branch finishes this migration and removes the legacy components entirely).
- Admin section consists of four discrete CRUD pages:
  - `/admin/new` – create a session.
  - `/admin/sessions` – inline edit/delete sessions.
  - `/admin/activities` – add/delete activities.
  - `/admin/venues` – add/delete venues.
- `/admin/page.tsx` itself is only a static list of links (no analytics, no in-page tables, no delete shortcuts, no saved metrics). Access gating still relies on the `NEXT_PUBLIC_ADMIN_EMAILS` allow list baked into each client page.
- Trait APIs, recommendation endpoints, cron routes, and Supabase migrations are present but focused on data hygiene rather than dashboards.

## Mobile Application State
- Expo app retains tab layout for Home, Map, Sessions, Saved, etc. Map improvements that surfaced Supabase-linked venues and saved-activity buttons were **not** part of this commit yet (those changes live only in later local edits).
- Session detail still exposes RSVP-era flows; `SavedActivitiesContext` existed but had not been expanded with the latest venue metadata helpers.

## Platform & Tooling
- README describes detailed Supabase migration workflow, taxonomy seeding (`018_activity_taxonomy.sql`), cron endpoints, and place catalog architecture (Overpass/Foursquare ingestion with optional Google Places runtime lookups).
- Admin/cron endpoints include `/api/traits/recompute/all`, `/api/cron/places/bangkok`, `/api/cron/events/run`, each protected by `CRON_SECRET`.

## Identified Limitations (relative to current branch)
- No analytics or moderation tooling on `/admin`; staff must open individual CRUD pages to audit/delete sessions or venues.
- No quick venue/session delete buttons from a centralized view; moderation requires drilling into each management page.
- Session/venue counts and top category insights are unavailable, making it harder for admins to gauge platform activity.
- Saved-activity metadata, trait onboarding UIs, and RSVP→attendance migrations remain incomplete compared with the current local branch.

Use this snapshot to contrast against `docs/current_app_overview_2025-12-03.md`, which documents the new branch (`feature/admin-dashboard-docs`).