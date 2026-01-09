# doWhat / Map Schema Drift Handoff

## Root Cause
- The database pointed to by `SUPABASE_DB_URL` (or `DATABASE_URL`) is behind the repo’s Supabase migrations, so API routes were selecting columns that don’t exist yet (e.g. `public.events.event_state`, `public.events.place_label`).
- This repo uses a simple migration runner (`run_migrations.js`) that replays SQL files from `apps/doWhat-web/supabase/migrations` into the target DB and records them in `public.schema_migrations`. If you point it at the wrong DB, you’ll still see drift.

## Canonical Map Columns (What the App Now Assumes)
- `activities`: `lat`, `lng`, `place_id` (place label is always derived from `places`)
- `events`: `lat`, `lng`, `place_id`, `event_state` (place label is derived from `places`)
- `sessions`: `place_id` (place label is derived from `places`)
- `places`: canonical place rows (cached reverse-geocode results; use `places.name` as label)

The migrations that enforce this are in `apps/doWhat-web/supabase/migrations` (notably `046_…`, `048_…`, `049_…`, `050_…`, `051_…`, `052_…`).

## Apply Migrations (Exact Commands)
From repo root:

```bash
# 1) Point at the correct Supabase Postgres DB
export SUPABASE_DB_URL='postgres://...'

# 2) Apply SQL migrations idempotently
pnpm db:migrate
```

If you want to sanity-check the connection first:

```bash
node test_db_connection.mjs
```

## Verify in SQL (No More “Column Does Not Exist”)
Use any SQL client (e.g. Supabase SQL editor, `psql`, TablePlus).

1) Confirm migrations ledger:

```sql
select filename, applied_at
from public.schema_migrations
order by filename desc
limit 30;
```

2) Confirm required columns exist:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'events' and column_name in ('event_state','place_id','reliability_score','verification_confirmations','verification_required'))
    or (table_name = 'activities' and column_name in ('lat','lng','place_id'))
    or (table_name = 'sessions' and column_name in ('place_id'))
  )
order by table_name, column_name;
```

3) Confirm `activities_nearby` returns `place_id` + `place_label`:

```sql
select id, name, place_id, place_label, lat_out, lng_out
from public.activities_nearby(13.7563, 100.5018, 2000, null, null, 5);
```

4) Confirm canonical place labels exist when `place_id` is present:

```sql
select
  (select count(*) from public.activities a join public.places p on p.id = a.place_id
    where a.place_id is not null and (p.name is null or btrim(p.name) = '')) as activities_missing_label,
  (select count(*) from public.events e join public.places p on p.id = e.place_id
    where e.place_id is not null and (p.name is null or btrim(p.name) = '')) as events_missing_label;
```

## Verify in UI
1) Start the web app: `pnpm dev:web`
2) Visit `http://localhost:3002/map`
3) Set filter to “Both”:
   - Activities render in their own section/column with a visible place label
   - Events render in their own section/column with a visible place label
   - No runtime errors like “column … does not exist”

## Common Drift Symptoms (And What To Do)

### Create Event fails: `column activities.place_id does not exist`
This happens in `/create` when it POSTs to `/api/sessions` and the API tries to persist `place_id/place_label` on the related activity.

As of 2026-01-08 the API now logs a warning and retries without the `place_id` column so Create Event is no longer blocked, but the flow can’t link activities to canonical places until you replay the migrations below.

Fix:
1) Make sure your migration target matches the app’s Supabase project:
   - `SUPABASE_DB_URL` host looks like `db.<PROJECT_REF>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_URL` should be `https://<PROJECT_REF>.supabase.co`
2) Re-run migrations: `pnpm db:migrate`
3) Verify the column exists:

```sql
select column_name
from information_schema.columns
where table_schema='public'
  and table_name='activities'
  and column_name in ('place_id','place_label');
```

If you still see the error after migrating, you’re almost certainly migrating the wrong database.

### Mobile Profile warning: `PGRST200 … user_badges ↔ v_badge_endorsement_counts`
`apps/doWhat-mobile/src/app/profile.simple.tsx` currently tries to embed a view:

`user_badges.select('..., v_badge_endorsement_counts!left(endorsements)')`

PostgREST can’t infer relationships to a view unless there’s an explicit relationship; this produces `PGRST200` and the app falls back to empty badge lists.

Minimal fix (recommended): query the view separately and merge by `(user_id, badge_id)`.
- Step 1: fetch `user_badges` (and `badges(*)`) without the embedded `v_badge_endorsement_counts`.
- Step 2: fetch `v_badge_endorsement_counts` with `.eq('user_id', uid)` and/or `.in('badge_id', badgeIds)`.
- Step 3: merge endorsements counts into the owned badges payload (default to `0`).

DB-side prerequisite: ensure `public.v_badge_endorsement_counts` exists (created in `apps/doWhat-web/supabase/migrations/007_badges.sql`):

```sql
select 1
from information_schema.views
where table_schema='public'
  and table_name='v_badge_endorsement_counts';
```

## Role Split (Codex CLI vs Copilot)
- Codex CLI (this workspace): keeps migrations/API/UI aligned, adds guard tests, and updates docs; cannot apply migrations to your Supabase DB without the correct `SUPABASE_DB_URL`, and cannot commit here because the git worktree pointer is broken.
- Copilot (your IDE): runs `pnpm db:migrate` against the correct DB, verifies via SQL + UI, applies any remaining app-side fixes (e.g. mobile badge query), and commits from a healthy clone/worktree.

## Tests / Guardrails
Run:

```bash
pnpm --filter dowhat-web typecheck
pnpm --filter dowhat-web test
```

These include API payload tests that assert `place_label` is always present and non-empty for `/api/events` and `/api/nearby`.

## If Git Is Broken (Worktree “.git/worktrees/…” Missing)
Symptom: `fatal: not a git repository` and `.git` is a file pointing at a missing path.

Safest repair path:
1) Re-clone the repo fresh into a new folder (from the real remote URL).
2) Copy these changed files from this workspace into the fresh clone:
   - `apps/doWhat-web/supabase/migrations/048_map_places_alignment.sql`
   - `apps/doWhat-web/supabase/migrations/049_activities_nearby_place_metadata.sql`
   - `apps/doWhat-web/supabase/migrations/050_activities_legacy_column_sync.sql`
   - `apps/doWhat-web/supabase/migrations/051_event_and_session_reliability_columns.sql`
   - `apps/doWhat-web/src/app/api/events/route.ts`
   - `apps/doWhat-web/src/app/api/events/queryEventsWithFallback.ts`
   - `apps/doWhat-web/src/app/api/events/[id]/route.ts`
   - `apps/doWhat-web/src/app/api/nearby/route.ts`
   - `apps/doWhat-web/src/lib/places/resolver.ts`
   - `apps/doWhat-web/src/lib/places/labels.ts`
   - `apps/doWhat-web/src/components/WebMap.tsx`
   - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
   - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
   - `README.md`
   - `AGENT_HANDOFF.md`
3) Commit from the fresh clone.

Avoid `git init` in this folder unless you intentionally want to throw away history.

## Acceptance Criteria (“Done”)
- `pnpm db:migrate` applies cleanly to the intended DB.
- `information_schema` confirms `events.event_state` + `events.place_label` exist (and related place columns exist for activities/sessions).
- `/map` loads without “column does not exist” errors.
- `/create` can POST to `/api/sessions` without `activities.place_id` schema errors.
- Mobile profile no longer logs `PGRST200` for `user_badges ↔ v_badge_endorsement_counts` and badges render (endorsement counts can default to `0`).
- With filter “Both”, Activities and Events show in separate sections and every card shows a non-blank place label (fallback “Unnamed spot” is acceptable).
- `pnpm --filter dowhat-web typecheck` and `pnpm --filter dowhat-web test` pass.

## 2026-01-08 Update (Map labels hardening)

### Changes shipped
- `eventPlaceLabel` now runs labels through `normalizePlaceLabel`, so event list + popups never render whitespace-only venue rows and keep Activities vs Events display logic distinct.
- Session-derived events in `/api/events` normalize their `place_label`/`venue_name` fields before serialization, preventing null labels when sessions are missing venue metadata.
- Map UI helpers fall back to `PLACE_FALLBACK_LABEL` (“Unnamed spot”) consistently for both Activities and Events, so `/map` can’t crash when optional columns are absent in the backing rows.
- Mobile profile no longer selects `v_badge_endorsement_counts` via a joined view; endorsements are fetched in a second query and merged client-side so the profile screen remains resilient when PostgREST cannot infer that relationship.

### How to verify in UI
1. Run `pnpm --filter dowhat-web dev` and open `http://localhost:3002/map`.
2. Toggle the data mode to “Both”, then click a few Activity cards and Event cards (including ones sourced from sessions) to open their popups.
3. **Expected:** every card/popup shows a `📍` row with either the stored label or the fallback “Unnamed spot”; no blank rows, and no runtime errors even if the DB row lacks `place_label`/`venue_name`.

### How to verify on mobile
1. Run `pnpm --filter doWhat-mobile exec expo start -c` (or open the Expo app you already launched) and sign in to a test user with badges.
2. Navigate to the simplified profile screen (`/profile.simple` entry in the dev navigator or the Profile tab).
3. **Expected:** badge lists load with endorsement counts (default `0` when none), and the Metro console no longer logs `PGRST200` warnings about `user_badges ↔ v_badge_endorsement_counts`.

## 2026-01-08 Update (Map performance)

### Changes shipped
- `/map` debounces move-end region updates and normalises bounds/radius to reduce request churn (fewer repeated/cancelled `/api/nearby` + `/api/events` calls for equivalent map regions).
- `WebMap` is now uncontrolled (`initialViewState` + imperative `easeTo`) so pan/zoom doesn’t force React rerenders on every frame.
- Added a reusable `useDebouncedCallback` hook (`apps/doWhat-web/src/lib/hooks/useDebouncedCallback.ts`) for consistent debouncing.

### How to verify (web)
1. Run `pnpm dev:web` and open `http://localhost:3002/map`.
2. Open DevTools → Network, filter for `nearby` and `events`.
3. Pan/zoom the map repeatedly.
4. **Expected:** at most ~1 request per move-end (after a ~250ms pause), and no storms of identical requests for the same lat/lng/filters.

## 2026-01-09 Update (Activities place labels)

### Changes shipped
- `activities.place_label` is no longer used; labels are derived from `places.name`.
- `/api/nearby` hydrates place labels by joining `places` when `place_id` is present, with a safe fallback to the venue name.
- Session creation resolves `place_id` from the linked activity first, otherwise reverse-geocodes and caches a place before persisting.

### How to verify
1. Run `pnpm db:migrate` to apply `052_activities_place_label_cleanup.sql`.
2. Confirm the column is gone:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'activities'
  and column_name = 'place_label';
```
3. Create an event from an activity with no `place_id` and verify a `place_id` is added and `/map` shows a non-empty label.

### Latest verification snapshot — 2026-01-09 06:05 UTC
- Ran the AGENT SQL checklist via `node --input-type=module …` (see shell history) against the DB referenced in `.env.local`.
- `schema_migrations` shows `045` through `052` applied recently (place cleanup at `2026-01-09T05:48:32Z`).
- `information_schema` confirms `activities.lat/lng/place_id`, `events.event_state/place_id/reliability_*`, and `sessions.place_id` all exist; `activities.place_label` returns zero rows (column removed).
- `public.activities_nearby` sample rows all include `place_id` plus non-empty `place_label` (e.g., “Smiths Bar”, fallback “Unnamed place”).
- Label-quality query reports `activities_missing_label = 0` and `events_missing_label = 0`, proving canonical `places.name` coverage for all linked rows.
