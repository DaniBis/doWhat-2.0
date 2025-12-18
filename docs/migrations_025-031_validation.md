# Migrations 025–037 Validation Checklist

_Last updated: 12 Dec 2025_

This note captures the verification steps for the recent Supabase schema work:

- Attendance + saved activities (025–034)
- doWhat core + reliability pledge foundations (035–037)

Use it when promoting changes to staging or production so we can prove migrations ran in order,
seed helpers completed, and rollback files are on hand.

## 6 Dec 2025 migration run (feature/admin-dashboard-docs)

- ✅ `pnpm run db:migrate` against `postgresql://postgres.kdviydoftmjuglaglsmm@aws-1-eu-west-2.pooler.supabase.com:6543/postgres` completed through `033_remove_event_participants.sql`.
- ✅ `pnpm run db:migrate` (6 Dec rerun) now lands on `034_admin_audit_logs.sql`, enabling the admin dashboard audit feed.
- ✅ `select filename from public.schema_migrations order by 1 desc limit 3;` → `034_admin_audit_logs.sql`, `033_remove_event_participants.sql`, `032_trait_policy_guard_fix.sql`.
- Fixes applied during the run:
   - 026 needed duplicate `seed_rows` CTE so reruns have scope for the INSERT.
   - 027 had a stray `alter table public.profiles` duplication; removed so DDL parses.
   - 028 previously required every `host_user_id`; added fallback that assigns missing sessions to `bisceanudaniel@gmail.com` (or the first profile) after trying attendee-derived hosts.
   - 031 switched from `uuid_generate_v4()` → `gen_random_uuid()` (pgcrypto) and removed `v.region` from the view to match production schema.

   ## 10 Dec 2025 prep (doWhat core)

   - [ ] Run `pnpm run db:migrate` against staging to apply `035_dowhat_core.sql` (plus `036_attendance_reliability_trigger.sql` and `037_reliability_pledge_ack.sql`) after capturing the latest database snapshot/backup.
   - [ ] Verify `select filename from public.schema_migrations order by 1 desc limit 1;` now returns `037_reliability_pledge_ack.sql`.
   - [ ] Rerun `pnpm --filter dowhat-web run typecheck` and mobile/web test suites after regenerating Supabase types so new enums/tables compile across packages.
   - [ ] Update this checklist with production rollout notes once the doWhat trio lands.


## How to apply

```bash
# 1. Point the runner at the target database (service-role connection string).
export SUPABASE_DB_URL="postgres://postgres:password@host:6543/postgres"

# 2. Replay every pending migration. The runner tracks applied files via
#    public.schema_migrations so it is safe to rerun.
pnpm run db:migrate
# alias for: node run_migrations.js

# 3. Seed helper data once the schema is in place (optional but recommended).
pnpm seed:taxonomy
pnpm seed:places:bangkok
pnpm seed:events:bangkok

# 4. Quick health check for required migrations (optional but fast).
node scripts/health-migrations.mjs --dowhat
# exits non-zero if core (025–031) or doWhat (034a–035) migrations are missing
```

> Note: `scripts/health-migrations.mjs` now also enforces the intermediate 032–034 files by default, so running it without flags guarantees the trait guard fix, event participant cleanup, and admin audit logs migrations are present. Pass `--dowhat` to extend the check through 034a–037.

The runner emits `[migrate] Applied 031_user_saved_activities.sql` when the last migration succeeds.
Check Supabase logs for DDL statements if you need external confirmation.

## Migration matrix

| #   | File | Purpose | Depends on | Rollback |
| --- | ---- | ------- | ---------- | -------- |
| 025 | `apps/doWhat-web/supabase/migrations/025_places_foursquare_metadata.sql` | Adds `city` + `foursquare_id` columns on `public.places`, backfills `city`, and adds a partial unique index so external IDs remain stable. | Places table from earlier migrations. | Idempotent (drops nothing). |
| 026 | `.../026_activity_catalog.sql` | Introduces `activity_catalog`, overrides, `venue_activities`, triggers, indexes, and seeds the initial catalog rows (chess/bowling/climbing/yoga). | 025 (places) + existing `activities` table. | No rollback file (safe to rerun). |
| 027 | `.../027_sessions_attendance.sql` | Creates/normalizes `sessions` + `session_attendees`, adds constraints, triggers, indexes, and RLS policies that power attendance parity. | 025–026 plus existing `profiles`, `venues`, `activities`. | No rollback file (forward-only change that enforces spec). |
| 028 | `.../028_sessions_schema_spec.sql` | Aligns the same tables with the published schema spec (stronger FK behavior, host backfills). | 027 | `028_sessions_schema_spec_rollback.sql` restores pre-spec FK + nullable host field. |
| 029 | `.../029_remove_rsvps_table.sql` | Deletes the legacy `public.rsvps` table now that all clients run on `session_attendees`. | 027/028 | `029_remove_rsvps_table_rollback.sql` recreates a minimal `rsvps` table. |
| 030 | `.../030_attendance_views.sql` | Adds `v_session_attendance_counts`, `v_activity_attendance_summary`, `v_venue_attendance_summary` to simplify API rollups. | 027–028 (requires normalized tables). | No rollback (views can be dropped manually). |
| 031 | `.../031_user_saved_activities.sql` | Creates `user_saved_activities`, helper views (`user_saved_activities_view`, `saved_activities_view`), indexes, triggers, and RLS. | Places + Profiles tables, attendance views optional. | Forward-only (dropping the table reverts). |
| 032 | `.../032_trait_policy_guard_fix.sql` | Patches the trait policy guardrail functions and grants to match docs/trait_policies_test_plan.md. | Existing trait tables + policies. | Rerun file (idempotent updates). |
| 033 | `.../033_remove_event_participants.sql` | Drops the deprecated `event_participants` table + enum so attendance relies solely on `session_attendees`. | Attendance migrations (027–028). | None (recreate table manually if needed). |
| 034 | `.../034_admin_audit_logs.sql` | Adds `admin_allowlist`, `admin_audit_logs`, and associated RLS so admin tooling can log destructive actions. | Existing admin dashboards (no schema deps). | Drop the tables if rollback required. |
| 034a | `.../034a_extend_attendance_status.sql` | Extends the `attendance_status` enum with `registered` + `late_cancel` ahead of the doWhat migration. | Enum created in 010 + any remaining references. | Forward-only (enum drops require manual fixes). |
| 035 | `.../035_dowhat_core.sql` | Adds profile reliability columns, `user_sport_profiles`, `session_open_slots`, new attendance enums, and sport metadata for the doWhat transformation. | Attendance + profile tables (027–034a). | Forward-only (requires manual cleanup to revert). |

## Validation checklist

1. **Schema migrations**
   - `node run_migrations.js` finishes without errors.
    - `select filename from public.schema_migrations where filename like '03%' order by 1;` returns
       `030_attendance_views.sql` through `037_reliability_pledge_ack.sql` (including `034a_extend_attendance_status.sql`).
2. **Attendance rollups**
   - `select * from v_session_attendance_counts limit 5;` succeeds.
   - `select going_count from v_activity_attendance_summary order by updated_at desc limit 5;` succeeds.
3. **Saved activities plumbing**
   - `select count(*) from user_saved_activities;` works.
   - `select * from user_saved_activities_view limit 5;` returns rows (or zero with correct columns).
4. **doWhat core data**
   - `select count(*) from session_open_slots;` runs (expect zero until data entry).
   - `select * from user_sport_profiles limit 5;` succeeds (may be empty pre-onboarding).
   - `select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid where typname = 'attendance_reliability_status';` shows the new enum values.
   - `select enumlabel from pg_enum pg join pg_type t on t.oid = pg.enumtypid where t.typname = 'attendance_status';` includes both `registered` and `late_cancel`.
   - `select reliability_pledge_ack_at, reliability_pledge_version from profiles where reliability_pledge_ack_at is not null limit 5;` works (expect zero rows until members acknowledge the pledge).
5. **Rollbacks on hand**
   - Keep `028_sessions_schema_spec_rollback.sql` and `029_remove_rsvps_table_rollback.sql` synced to prod.
   - Document in the release note which migration would require a rollback and under what conditions.

### Rollback dry-run

For the migrations that carry explicit rollback files, verify they still apply cleanly by running them against a disposable Supabase database:

```bash
export SUPABASE_DB_URL=postgres://postgres:password@host:6543/postgres
node run_migrations.js --only 028_sessions_schema_spec.sql
psql "$SUPABASE_DB_URL" -f apps/doWhat-web/supabase/migrations/028_sessions_schema_spec_rollback.sql
```

Repeat the pattern for `029_remove_rsvps_table.sql` / `029_remove_rsvps_table_rollback.sql`. Each rollback script should complete without errors after the paired migration runs, proving we can unwind if necessary. Capture the dry-run output in release notes when promoting to staging/production.
6. **Seed scripts** (optional but recommended on fresh environments)
   - `pnpm seed:taxonomy` populates shared taxonomy tables.
   - `pnpm seed:places:bangkok` + `pnpm seed:events:bangkok` hydrate demo data used by dashboards.
   - `pnpm seed:dowhat` spins up the Bucharest pilot data set (profiles, venues, sessions, open slots, and sport profiles). Follow it with `pnpm verify:dowhat` (same Supabase env vars) to auto-confirm the hosts, venues, activities, sessions, open slots, and host attendance rows are all present. Need to rewind the pilot? Run `pnpm rollback:dowhat` to delete the same set of records (plus the seeded auth users) before reseeding.

### Seed validation queries

Run the following SQL after each seed helper to confirm the expected rows were inserted:

```sql
-- Taxonomy version should advance after pnpm seed:taxonomy
select version, updated_at from activity_taxonomy_state order by updated_at desc limit 1;

-- Bangkok demo data should exist after pnpm seed:places:bangkok / pnpm seed:events:bangkok
select count(*) from places where city = 'Bangkok';
select count(*) from events where metadata ->> 'seedSource' = 'bangkok-demo';

-- doWhat pilot data should exist after pnpm seed:dowhat
-- Prefer running the automated verifier for full coverage:
--   pnpm verify:dowhat
-- It checks profiles, sport profiles, venues, activities, sessions, open slots, and host attendance rows.
-- Need to clean up a stale pilot? Use:
--   pnpm rollback:dowhat
-- to remove the seeded sessions/slots/venues/activities/profiles/auth users before reseeding.
```

If any query returns zero rows, rerun the corresponding seed command (and re-run `pnpm verify:dowhat` for the pilot data) after confirming `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

## Troubleshooting

- Runner fails before writing to `public.schema_migrations`: re-run after fixing the SQL file; partial
  writes are rolled back because each migration runs inside a transaction.
- Runner complains about missing Postgres extensions (e.g., `uuid-ossp`, `postgis`): enable them in the
  Supabase project once and rerun.
- Seeds fail with auth errors: ensure `SUPABASE_SERVICE_ROLE_KEY` is available in the environment and the
  scripts are executed from the repo root.

## Related files

- `run_migrations.js` – shared migration runner.
- `database_updates.sql` – this document’s short-form summary.
- `docs/archive/database_updates_traits.sql` – the pre-Step-5 SQL snapshot (kept for reference).
