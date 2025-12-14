# Social Sweat Pilot Validation

Use this checklist whenever you need to spin up the Bucharest Social Sweat pilot data (for demos, regression testing, or Find a 4th UX reviews). It walks through seeding Supabase, verifying the mobile/web experiences, and troubleshooting common issues.

## Prerequisites

- Access to the target Supabase project (URL + service role key). The seed script writes directly to `auth`, `profiles`, `user_sport_profiles`, `venues`, `activities`, `sessions`, `session_open_slots`, and `session_attendees`.
- Node 20+, pnpm 9+, and the repo dependencies installed (`pnpm install`).
- Optional: export `SOCIAL_SWEAT_SEED_PASSWORD` to force a deterministic password for any newly created pilot accounts (otherwise the script generates random ones and prints them at the end).

## 1. Seed the Bucharest pilot data

From repo root:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
# Optional – keeps host passwords predictable across runs
export SOCIAL_SWEAT_SEED_PASSWORD="Sweat-Pilot-Password!"

pnpm seed:social-sweat
```

What the script does:

1. Ensures the three Bucharest hosts exist in Supabase auth:
   - `mara.padel.host@socialsweat.dev` (padel)
   - `alex.run.host@socialsweat.dev` (running)
   - `ioana.climb.host@socialsweat.dev` (climbing)
2. Upserts their `profiles`, `user_sport_profiles`, availability windows, and accepts the reliability pledge (version `social-sweat-v1`).
3. Upserts venues + activities tagged with `social-sweat:bucuresti` metadata.
4. Creates three sessions with `session_open_slots` rows so the “Find a 4th player” carousel immediately has ranked inventory.
5. Registers each host for their own session in `session_attendees` so the roster looks realistic.

The script reuses deterministic UUIDs, so rerunning it is idempotent. Newly created users (when `SOCIAL_SWEAT_SEED_PASSWORD` is not set) are logged in the terminal with their generated password.

Run `pnpm verify:social-sweat` (same Supabase env vars) to confirm the host profiles, sport profiles, venues, activities, sessions, open slots, and host attendance rows are all present before moving on. If you need to start over, `pnpm rollback:social-sweat` removes every seeded session/slot/venue/activity/profile/auth user so the next seed run starts from a clean slate.

## 2. Confirm migrations + health

Run the standard health script to make sure migrations and Supabase policies match expectations:

```bash
pnpm health
```

This checks env wiring, required migrations (`--social-sweat` roster), trait policies, verifies the Bucharest pilot entities via `scripts/verify-social-sweat.mjs`, and pings the `/api/health` endpoint.

## 3. Validate the mobile Find a 4th experience

1. Start the Expo app:
   ```bash
   pnpm --filter doWhat-mobile start
   ```
2. Launch the Expo Go client or a simulator and sign in with one of the seeded host accounts (use the password you configured or the one printed by the seeder).
3. On the Home tab:
   - Scroll to the “Find a 4th player” section.
   - Ensure the emerald hero card shows the top-ranked session (match score, slots pill, skill label, distance, and CTA linking to `/(tabs)/sessions/[id]`).
   - Swipe through the supporting cards; they should match the remaining seeded sessions and respect Save/Saved state.
4. Tap the hero CTA to confirm the session detail page loads with the open-slot metadata and Save toggle intact.
5. (Optional) Toggle Save on the hero and confirm the badge updates immediately—this verifies that the seeded venues/activities resolve via the shared payload builders.

If the hero does not appear:

- Double-check that `pnpm seed:social-sweat` succeeded (no Supabase errors) and that your mobile session is authenticated (otherwise the open-slot fetch falls back).
- Verify the feature flag `EXPO_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS` is not set to `false` in your `.env`.

## 4. Validate the web admin + discovery views

1. Start the Next.js app:
   ```bash
   pnpm --filter dowhat-web dev
   ```
2. Sign in on the web app with the same host credentials.
3. Visit `/admin` and `/admin/sessions`:
   - Confirm the seeded sessions appear in the tables with their venues, match scores, and open-slot counts.
   - Use the “Plan another” links to ensure `session_open_slots` metadata flows into `/admin/new` (optional sanity check).
4. Open `/map` or `/discover` and verify the seeded venues/activities show up with accurate Save/Saved state and attendance badges.

## 5. Troubleshooting & cleanup

- **Missing hosts or sessions:** rerun `pnpm seed:social-sweat`. Because IDs are deterministic, the upserts will repair partial data without duplicating records. If you need a full reset, run `pnpm rollback:social-sweat` before reseeding.
- **`auth.admin.createUser` 500 with `user_id` errors:** apply the latest migrations (`pnpm db:migrate` with `SUPABASE_DB_URL` set) so `040_profiles_handle_new_user.sql` installs the trigger version that writes `profiles.user_id`, then rerun the seed once it finishes.
- **Wrong password:** set `SOCIAL_SWEAT_SEED_PASSWORD` and rerun the seed. The script will update auth users with the new password.
- **Stale mobile cache:** in Expo, shake the device (or press `Ctrl + m` on Android emulator) and reload the app to refresh Supabase queries.
- **Removing pilot data:** delete rows with the `social-sweat:bucuresti` seed tag from `venues`/`activities`/`sessions` and revoke the pilot users in Supabase auth. There isn’t an automated cleaner yet (file an issue if needed).

Following these steps ensures the Social Sweat demo environment always has credible data, the “Find a 4th player” ranking remains populated, and both mobile + web flows stay regression-safe.
