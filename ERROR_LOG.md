# Error Log

## 2025-12-14 – Trait onboarding still missing user rows (RESOLVED)
- **Surface**: iOS simulator (Expo) while saving base traits via `/onboarding-traits`.
- **Symptom**: Console showed paired warnings: `ensure_public_user_row failed (users_email_key)` followed by `user_base_traits ... violates foreign key constraint "user_base_traits_user_id_fkey"`.
- **Root cause**: The screen only called the RPC to seed `public.users`. When the RPC hit a duplicate-email error it returned `false`, leaving the `users` row for the current auth id missing, so the next insert failed with `23503`.
- **Fix**: Introduced `apps/doWhat-mobile/src/lib/ensureUserRow.ts`, which first upserts into `public.users` (respecting RLS) and only falls back to the RPC on RLS/email conflicts. Both `AuthGate` and the trait onboarding screen now call the shared helper before every profile/trait save and retry with it when Supabase reports a missing-user FK.
- **Status**: Verified by rerunning `pnpm --filter doWhat-mobile test -- onboarding-traits` (green) and manually repeating the trait flow without warnings.

## 2025-12-14 – Mobile onboarding progress redbox (RESOLVED)
- **Surface**: Expo iOS simulator when visiting the Home tab or any screen that renders `OnboardingNavPrompt` / `OnboardingNavPill`.
- **Symptom**: React Native redbox spam (`Console Error [useOnboardingProgress] failed to load progress {"message":""}`) and the CTA card shows “Could not load onboarding progress.” The `/api/health` endpoint also reported `user_traits` missing.
- **Root cause**: The database schema was missing the most recent migrations _and_ the health endpoint incorrectly selected a non-existent `id` column from `user_traits`, so even after replaying SQL files the check continued to fail (and obscured the real issue). The missing schema prevented Supabase from returning onboarding data, and the RN dev client escalated the logged errors to redboxes.
- **Fix**: Replayed every migration against the Supabase project (`SUPABASE_DB_URL=postgresql://postgres:REDACTED@db.kdviydoftmjuglaglsmm.supabase.co:5432/postgres node run_migrations.js`, which applied `041_attendance_disputes.sql` and confirmed all earlier files were stamped). Updated `/api/health` to probe tables with `select('*', { head: true })` so it no longer assumes an `id` column exists. With the schema in place and the health check fixed, `curl http://localhost:3002/api/health` now returns `{ "ok": true }` and the Expo onboarding CTA hydrates without errors.
- **Security follow-up**: Rotate credentials if this was ever pushed.
- **Additional fix (same day)**: `useOnboardingProgress` was still selecting a non-existent `id` column from `user_base_traits` when counting base traits, which returned an empty error payload from PostgREST. Switching the select to `trait_id` (any real column works because we only need the count/head request) unblocks the hook and removes the console warning.
- **Status**: Fixed; keep `pnpm --filter dowhat-web dev` running and rerun `node run_migrations.js` whenever new SQL files land.

## 2025-12-06 – Trait onboarding foreign key failure (RESOLVED)
- **Surface**: iOS dev client (Expo) during onboarding trait save step.
- **Symptom**: Supabase returned `23503` (`user_base_traits.public_user` violates foreign key) when saving the first trait selection.
- **Root cause**: The onboarding flow was inserting into `user_base_traits` before the public user row existed.
- **Fix**: Updated `apps/doWhat-mobile/src/app/onboarding-traits.tsx` to call `ensure_public_user_row` (RPC) before saving traits and to retry once if Supabase still reports `23503`.
- **Status**: Verified via automated tests (`apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`) and manual iOS smoke test.

## 2025-12-06 16:40 UTC – `/api/health` reports `user_traits` table unavailable (RESOLVED)
- **Surface**: `curl http://localhost:3002/api/health` while Next.js API server was running on port 3002.
- **Symptom**: Endpoint returned `{"ok":false,"supabase":true,"tables":{"user_badges":true,"traits_catalog":true,"user_traits":false,"badges":true,"trait_events":true},"missing":["user_traits"]}`.
- **Impact**: Indicates backend cannot reach the `user_traits` table; APIs that read/write user trait rows may fail.
- **Follow-up**: Re-tested at 19:05 UTC after mobile client rebuild; endpoint still reports `user_traits` missing.
- **Resolution**: Replayed the full migration set via `SUPABASE_DB_URL=postgresql://... node run_migrations.js`, then updated `/api/health` to probe tables with `select('*', { head: true })` so it no longer assumes an `id` column exists.
- **Verification**: `curl http://localhost:3002/api/health` now returns `{ "ok": true }` and the Expo onboarding CTA hydrates without errors (validated 2025-12-14 while `pnpm --filter dowhat-web dev` was running).
- **Status**: Closed 2025-12-14; rerun `node run_migrations.js` whenever new SQL lands to keep health green.

## 2025-12-06 19:00 UTC – Expo inspector overlay auto-opening (RESOLVED)
- **Surface**: iOS dev client displayed the Inspector/Perf/Touches bar on every launch, obstructing onboarding QA.
- **Root cause**: `EX_DEV_CLIENT_NETWORK_INSPECTOR` defaulted to `true` in `android/gradle.properties` and `ios/Podfile.properties.json`, so the dev menu tools auto-mounted.
- **Fix**: Set the property to `false` for both platforms and rebuilt the native dev client (removed `.native-dev-client-signature` + reran `pnpm --filter doWhat-mobile run start:ios`).
- **Status**: Verified on iPhone 16 Pro simulator; no overlay appears when the bundle loads.

## 2025-12-14 – iOS auth crash “Invalid Refresh Token: Refresh Token Not Found” (RESOLVED)
- **Surface**: Expo iOS dev client showed a redbox referencing `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` as soon as the bundle loaded.
- **Root cause**: Corrupt/expired Supabase refresh tokens persisted in AsyncStorage and the app called `supabase.auth.getSession()`/`getUser()` without handling the rejection, so React Native bubbled the error.
- **Fix**: Added `maybeResetInvalidSession` helper (`apps/doWhat-mobile/src/lib/auth.ts`) and taught `AuthGate` + `AuthButtons` to call it whenever Supabase throws, clearing the local session via `signOut({ scope: 'local' })` and resetting UI state instead of crashing.
- **Status**: Relaunched Expo on iPhone 16e simulator; the auth gate now falls back to the sign-in screen instead of crashing, and repeated launches stay stable.

## 2025-12-14 – Profile save fails (`null value in column "user_id" of relation "profiles"`) (RESOLVED)
- **Surface**: On the onboarding profile screen, hitting “Save and continue” raised Supabase errors (`null value in column "user_id" ...` and `duplicate key value violates unique constraint "users_email_key"`).
- **Root cause**: The mobile profile upsert only populated `id`, leaving the newly required `user_id` column empty, and our custom `ensureAppUserRow` didn’t retry via the `ensure_public_user_row` RPC when it hit a duplicate-email constraint.
- **Fix**: Updated `AuthGate` profile payloads to set both `id` and `user_id`, and taught `ensureAppUserRow` to detect the `users_email_key` violation and fallback to the RPC so the supporting user row is created server-side.
- **Status**: After re-running the profile flow on the simulator the redboxes disappeared, the profile row persisted, and onboarding continues to the trait picker.
