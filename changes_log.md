# Changes Log

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
