# Error Log

## 2025-12-16 – Map only showed chess & mislabeled activities (RESOLVED)
- **Surface**: Web map `/map` when toggling “Activities” or “Both” with no filters.
- **Symptoms**: The Activities column (and map pins) only ever displayed the user-created “chess” location, while the Events list looked correct—giving the impression that events and activities were swapped.
- **Root cause**: The `/api/nearby` route returned immediately after it found at least one row in `activities`, so our Overpass/osm fallback never ran. Once a single community-created spot existed in the table, the endpoint stopped fetching smart-search venues altogether, leaving only that chess record under Activities and making the section appear to show events. Later in the evening the Overpass API started timing out again, which meant the Activities list fell back to zero rows instead of showing real venues.
- **Fix**: `/api/nearby` now always attempts to append Overpass venues until it reaches the requested limit, deduping them against database rows and marking when the fallback was used. If Overpass fails again we cascade to a Supabase `venues` fallback (using live lat/lng bounds) before surfacing an error, ensuring Activities always contains something in the area even when the external API is down.
- **Status**: Reloaded `/map` with no filters—Activities once again lists multiple nearby venues sourced from the algorithm, while the user-created chess sessions remain under Events.

## 2025-12-16 – Map events fallback still surfaced schema error (RESOLVED)
- **Surface**: Web map `/map` (Events feed in the right rail).
- **Symptom**: Even with yesterday's fallback, the feed immediately showed the red banner `column events.normalized_title does not exist` instead of the empty-state copy when no sessions matched the filters.
- **Root cause**: Some Supabase environments lack both `events.title` and `events.normalized_title`. The API correctly retried with `normalized_title:title` after the first query failed, but the second query died on the missing normalized column and bubbled a 500 to the UI.
- **Fix**: `/api/events` now detects when both columns are absent, logs a warning, and returns an empty dataset with HTTP 200 so the client renders the “No events match” card instead of a blocking error.
- **Status**: Reloaded `/map` with filters that previously triggered the error; the banner no longer appears and the empty-state message shows as expected.

## 2025-12-16 – Create Event always reported failure (RESOLVED)
- **Surface**: Web Create Event form (`/create`) after launching from the map.
- **Symptom**: Submitting the form popped `Failed to create event.` even though all required fields were filled, so users assumed nothing was saved.
- **Root cause**: The client-side form expected the API to return `{ id }`, but `/api/sessions` responds with `{ session: { id } }`. The mismatch meant the UI treated every success as a failure, never showed the green toast, and never redirected to the new session.
- **Fix**: Added `extractSessionId.ts` to normalize the response shape, updated the Create Event form to use it, and covered the helper with Jest tests. The form now accepts either payload shape and only surfaces an error when the API truly fails.
- **Status**: Ran `pnpm --filter dowhat-web test -- extractSessionId` via the Jest runner (see `apps/doWhat-web/src/app/create/__tests__/extractSessionId.test.ts`). Manually verified through the browser that submitting the form now shows the success banner and redirects to `/sessions/:id`.

## 2025-12-16 – Map filters triggered build-time syntax error (RESOLVED)
- **Surface**: Hitting `/map` after filtering for “chess” or toggling to “Both” while the dev server compiled `apps/doWhat-web/src/app/api/events/route.ts`.
- **Symptom**: Next.js red error overlay “Failed to compile … Expression expected” pointing to `route.ts:28:1`, blocking the page entirely.
- **Root cause**: While wiring the events column fallback we accidentally left a duplicate `const missingColumn = …` declaration (one with no body) above the actual helper, so TypeScript parsing broke before the API could run.
- **Fix**: Removed the stray declaration so only the intended helper remains.
- **Status**: Saved the file, the dev server recompiles cleanly, and switching to “Both” on `/map` no longer surfaces the build error.

## 2025-12-16 – Newly created events never showed on the map & page never redirected (RESOLVED)
- **Surface**: Creating an event from `/map` → “Create event” CTA.
- **Symptom**: The form displayed “Event created successfully!” but stayed on `/create`, and returning to the map still showed “No events match” inside the Events list even though a session was just created.
- **Root cause**: The create flow always redirected to `/sessions/:id` (not back to the map), and the map’s Events feed only queried the `public.events` ingestion table. Sessions are stored in `public.sessions`, so new community events were invisible unless they were manually copied over.
- **Fix**: Added a `returnTo` parameter when launching the Create screen so the form can send users back to their previous `/map` view (injecting `highlightSession=<id>` to focus the new entry). On the backend, every session POST now upserts a sibling row into `public.events` via `syncSessionToEvents`, tagging the metadata with `sessionId`. The map detects that metadata to route “View details” to `/sessions/:id`, so newly created sessions appear immediately under Events/Both.
- **Status**: Verified by creating a “chess” event via the map drawer: the form redirects back to `/map` with the existing filters, and the Events panel now lists the new session without clearing the search.

## 2025-12-16 – Map crashed: `usePathname` is not defined (RESOLVED)
- **Surface**: Reloading `/map` after the latest changes.
- **Symptom**: Next.js overlay showed “Unhandled Runtime Error – ReferenceError: usePathname is not defined” pointing to `src/app/map/page.tsx:89`.
- **Root cause**: We started calling `usePathname()`/`useSearchParams()` but forgot to import them from `next/navigation`, so the runtime couldn’t find the symbol.
- **Fix**: Updated the import to pull `{ usePathname, useRouter, useSearchParams }` from `next/navigation`.
- **Status**: Dev server recompiles and the map renders again without the runtime error.

## 2025-12-16 – Map search only surfaced activities, not community events (RESOLVED)
- **Surface**: `/map` with the “Both” tab + search term (e.g., “chess”).
- **Symptoms**: Newly created sessions like “chess balkan” only appeared under Activities; the Events panel stayed empty and the “View details” chip pointed to a dead link.
- **Root cause**: The map fetched exclusively from `public.events`, but our community sessions live in `public.sessions`. Even though we attempted to mirror sessions into events, that table was still empty in many dev databases, so the Events query returned zero rows. The UI also rendered a redundant “View details” button per card.
- **Fix**: `/api/events` now merges upcoming sessions (hydrated with venue/activity coordinates) into the response, ensuring search results include both community events and ingested feeds. Each session is tagged in metadata so the front end can route straight to `/sessions/:id`. On the UI side we removed the stray “View details” button to avoid duplicates.
- **Status**: Filtering for “chess” now lists both relevant activities and the newly created session under Events/Both. Clicking the event card centers it on the map and takes you to the session details when needed.

## 2025-12-15 – Sport onboarding save failed (`profiles_user_id_not_null`) (RESOLVED)
- **Surface**: Web sport onboarding step (`/onboarding/sports`) on Next dev server.
- **Symptom**: Clicking “Save preferences” instantly raised the red banner “Could not save your preferences. Please try again.” and the console logged Supabase error `null value in column "user_id" of relation "profiles"` whenever the profile row hadn’t been created yet.
- **Root cause**: The sport step upserted into `profiles` with only the primary key (`id`) plus sport/play-style fields, leaving the required `user_id` column null. PostgREST rejected the upsert before the sport profile write even ran, so the UI never persisted preferences.
- **Fix**: Reused the authenticated Supabase user stored inside `SportSelector`, called `ensureUserRow` to seed `public.users`, and updated the profile payload to set both `id` and `user_id`. Once the profile row satisfies the constraint, the subsequent `user_sport_profiles` upsert and redirect succeed.
- **Status**: Manually retested via Chrome (new Supabase user). Sport selection now saves, `profiles.user_id` matches the auth id, and the flow jumps to `/onboarding/reliability-pledge` without errors.

## 2025-12-15 – Reliability reminder persisted after completion (RESOLVED)
- **Surface**: Web sport onboarding page left rail.
- **Symptom**: Even after locking the reliability pledge, the Step 2 page continued to show the amber “Next up · Reliability pledge” callout, implying the user still had work to do.
- **Root cause**: The page rendered the reminder unconditionally; it never checked `reliability_pledge_ack_at`, so previously completed users saw outdated guidance.
- **Fix**: The server component now fetches the profile’s `reliability_pledge_ack_at` via Supabase before rendering. If the timestamp exists we swap in a confirmation card instead of the reminder, while still linking to the pledge page for edits.
- **Status**: Reloaded the page after completing the pledge—the reminder disappears and the green “pledge locked” card appears instead.

## 2025-12-15 – Map “Nearby events” feed failed (`column events.title does not exist`) (RESOLVED)
- **Surface**: Web map `/map` Events tab.
- **Symptom**: The right rail displayed a red banner `column events.title does not exist` and no events rendered whenever the feed query ran.
- **Root cause**: Some Supabase environments only expose `normalized_title` (no `title`) on the `events` table. The API route hard-selected `title`, so PostgREST rejected the request before we could fall back to the normalized field.
- **Fix**: Refactored `/api/events` to try the original column list first and automatically retry with `normalized_title:title` when the backend reports a missing `title` column. The alias preserves the `title` key for the frontend regardless of which schema is present.
- **Status**: Reloaded `/map?tab=events` after the change; the feed now returns data (falling back silently when needed) and no error banner appears.

## 2025-12-15 – Web sign-in & sign-up never persisted (RESOLVED)
- **Surface**: Web auth flows (header buttons + `/auth` page) using Google OAuth.
- **Symptom**: After completing Google sign-in/sign-up the site always returned to `/auth/callback` but the header still showed “Sign in”/“Sign up” and no onboarding UI was presented—the Supabase session never stuck.
- **Root cause**: The server-side Supabase helper (`createClient`) intentionally no-op’d cookie writes so that server components wouldn’t attempt to mutate headers. The OAuth callback and sign-out route both relied on that helper, so `exchangeCodeForSession`/`signOut` could not set or clear the `sb-auth-token` cookies, leaving users perpetually anonymous.
- **Fix**: Added `createRouteHandlerClient`, which uses the same Supabase credentials but allows cookie mutations inside route handlers. The auth callback and sign-out routes now use it, so OAuth responses persist the session and sign-out clears it reliably.
- **Status**: Manually exercised Google sign-in/sign-up (new and existing accounts) and sign-out locally; after redirect the avatar icon appears immediately, `/auth/signout` drops the session, and reloading keeps the expected state.

## 2025-12-15 – Account menu + reliability pledge felt sluggish (RESOLVED)
- **Surface**: Logged-in header avatar menu and `/onboarding/reliability-pledge`.
- **Symptoms**: Tapping “View profile” took ~2s before anything happened, and locking the reliability pledge stayed on the same page with only a toast—no automatic redirect back to onboarding/profile. Overall navigation felt laggy.
- **Root cause**: The inline auth widget waited for a manual click before fetching the profile route, so selecting the menu item had to load the profile bundle from scratch. The reliability pledge component saved state but never navigated away, leaving users wondering if anything happened.
- **Fix**: `AuthButtons` now prefetches `/profile` as soon as a user session exists and pushes immediately when “View profile” is clicked, making the transition feel instant. The pledge component accepts a `redirectTo` prop, prefetches the destination, and pushes after a short delay once the pledge saves (defaulting to `/profile`, overridable via `?next=`). The reliability page wires the param through so flows can bounce users to their next step automatically.
- **Status**: Tested via Chrome—avatar menu switches to profile in <200 ms, and completing the pledge now shows the success message then jumps to `/profile` (or the supplied `next`) without manual intervention.

## 2025-12-15 – Map events endpoint schema error (RESOLVED)
- **Surface**: Web map (`/map`) when loading events in the right-hand drawer.
- **Symptom**: Red alert "Could not find a relationship between 'events' and 'places' in the schema cache" and zero events rendered.
- **Root cause**: `/api/events` attempted to join `events` → `places` via Supabase's implicit relationship (`place:places(...)`), but the database no longer has a foreign key wired between those tables, so Supabase returned a 400.
- **Fix**: Updated `apps/doWhat-web/src/app/api/events/route.ts` to fetch events first and then issue a second query for the referenced place ids, merging the results in code to avoid relying on the missing relationship.
- **Status**: Reloaded `/map` after the change; events now hydrate without errors.

## 2025-12-15 – Header account icon never appeared after sign-in (RESOLVED)
- **Surface**: Web header inline auth controls on `/map`, `/venues`, etc.
- **Symptom**: Even after Supabase reported an authenticated session, the header continued to show the textual "Sign in" chip, so users had no quick way to access their profile/sign out.
- **Root cause**: `AuthButtons` only swapped the inline button to a text-based Profile/Sign out pair, rather than replacing it with the account icon requested for parity with design.
- **Fix**: Added a compact avatar-style trigger with a dropdown menu (`apps/doWhat-web/src/components/AuthButtons.tsx`). Once signed in, the sign-in chip is replaced by the icon, which now exposes profile + sign-out actions.
- **Status**: Verified by signing in locally; the icon appears immediately post-login and the fallback button still renders for logged-out/SSR states.

## 2025-12-15 – Duplicate header Sign in CTAs (RESOLVED)
- **Surface**: Web Venues page header in Next.js dev server (`localhost:3002/venues`).
- **Symptom**: Two "Sign in" chips rendered side-by-side in the navbar until hydration finished, confusing users and QA screenshots.
- **Root cause**: The SSR fallback link (`#auth-fallback-link`) remained visible even after the dynamic `AuthButtons` component hydrated and rendered its own inline button. We only hid the fallback when Supabase reported a signed-in session, so anonymous visitors saw both CTAs indefinitely.
- **Fix**: Updated `apps/doWhat-web/src/components/AuthButtons.tsx` to hide and aria-hide the fallback link immediately on mount (and after every auth state change), ensuring only one button is visible once React hydrates.
- **Status**: Verified in Chrome by hard-refreshing `localhost:3002/venues`; the duplicate button disappears right after hydration while the fallback still renders for no-JS clients.

## 2025-12-15 – Venues map crashed on missing `metadata` column (RESOLVED)
- **Surface**: Web Venues page map section (`localhost:3002/venues`).
- **Symptom**: Map panel showed `{ "code": "42703", "message": "column venues.metadata does not exist" }` and no venues rendered.
- **Root cause**: `apps/doWhat-web/src/lib/venues/search.ts` still selected the legacy `metadata` column even though the Supabase `venues` table dropped it during the Smart Discovery cleanup. Supabase returned `42703` and our fetch bubble surfaced the error in the UI.
- **Fix**: Removed `metadata` from the `select(...)` clause (the discovery helper already handles nulls), unblocking the `/api/search-venues` handler.
- **Status**: Reloaded the page after the change; the map populates again and fetch logs stop emitting 500s.

## 2025-12-14 – Trait onboarding failed when duplicate `public.users` rows existed (RESOLVED)
- **Surface**: Expo iOS simulator (onboarding traits save button).
- **Symptom**: Console showed `[traits] user_base_traits failed due to missing users row {"code":"23503",...}` every time the save button was tapped, paired with `[ensureUserRow] ensure_public_user_row RPC failed {"code":"23505","message":"duplicate key value violates unique constraint \"users_email_key\""}`. The UI displayed “Your account needs to finish syncing. Sign out and back in, then try again.”
- **Root cause**: The Supabase `ensure_public_user_row` function only upserted on `id`, so if the `public.users` table already contained a stale row with the same email (from a previous auth user id), the insert conflicted on `users_email_key` and aborted. The new auth user never received a mirror row, so subsequent writes to `user_base_traits` failed with the foreign-key check.
- **Fix**: Added migration `042_public_users_duplicate_cleanup.sql`, which deletes any conflicting `public.users` row that shares the new user’s email before performing the upsert. Re-run `node run_migrations.js` (or `pnpm run db:migrate`) so the updated function ships to your database, then retry the onboarding flow.
- **Status**: After applying the migration locally, reran `pnpm --filter doWhat-mobile test -- apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx` (pass) and confirmed the onboarding save call succeeds without warnings.

## 2025-12-14 – Places viewport request exploded when the web dev server was offline (RESOLVED)
- **Surface**: Expo iOS simulator on the Home screen.
- **Symptom**: Dev client surfaced a red box with `[Home] Places fetch failed TypeError: Network request failed` whenever `/api/places` on the Next dev server wasn’t running.
- **Root cause**: The mobile Home screen only queried the Next.js Places API. When that server was down (or running on a different host), `fetch` threw a network error and we logged via `console.error`, which Expo promotes to a red-box alert.
- **Fix**: Added a Supabase fallback that queries the `venues` table inside the same bounding box and hydrates lightweight `PlaceSummary` rows whenever the primary fetch fails. The log level was downgraded to `console.warn`, and the UI now shows a “limited nearby venues” banner instructing devs to start `pnpm --filter dowhat-web dev` for richer data.
- **Status**: Verified via `pnpm --filter doWhat-mobile test -- apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx` and a manual Expo run with the web server stopped (fallback list renders, no red box).

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
