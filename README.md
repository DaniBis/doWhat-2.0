# doWhat — Web + Mobile (Expo) with Supabase

This monorepo contains a Next.js web app and an Expo (React Native) mobile app that share a tiny utilities package. Supabase powers auth and data (sessions, RSVPs, profiles, venues, activities) and we use Postgres RPC for nearby search.

## Structure

- apps/
  - doWhat-web/ (Next.js App Router)
  - doWhat-mobile/ (Expo Router)
- packages/
  - shared/ (format helpers, types)

## Prerequisites

- Node 20+
- pnpm 9+
- Supabase project (URL + anon key)

## Environment variables

Create a `.env.local` at repo root (used by dev helpers):

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com,other@example.com
```

Web also reads env from its own folder; mobile reads EXPO_ variables from its own folder.

Web (`apps/doWhat-web/.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_ADMIN_EMAILS=you@example.com
```

Mobile (`apps/doWhat-mobile/.env.local`):

```
EXPO_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Supabase configuration

Authentication → URL Configuration → Redirect URLs (add):

- `http://localhost:3000/auth/callback` (web)
- `dowhat://auth-callback` (mobile deep link)
- (optionally) `dowhat://auth-callback/`

Providers → Google:

- Leave redirect URI as the default Supabase callback: `https://<project>.supabase.co/auth/v1/callback`

## Run locally

Install deps once:

```
pnpm install
```

Web dev:

```
pnpm --filter ./apps/doWhat-web dev
```

Mobile dev (Expo):

```
pnpm --filter ./apps/doWhat-mobile exec expo start -c
```

## Admin features

- `/admin/new` – create a session (select/add activity/venue, set price and time)
- `/admin/sessions` – inline edit price/time and delete sessions
- `/admin/activities` – add/delete activities
- `/admin/venues` – add/delete venues (lat/lng optional)

Gatekeeper: set `NEXT_PUBLIC_ADMIN_EMAILS` to a comma-separated allowlist.

## Database notes

**Important**: Run migrations in order in your Supabase SQL Editor:

1. `apps/doWhat-web/src/lib/supabase/migrations/002_schema.sql` – core tables (activities, venues, sessions, rsvps)
2. `apps/doWhat-web/src/lib/supabase/migrations/003_profiles.sql` – profiles table linked to auth.users
3. `apps/doWhat-web/src/lib/supabase/migrations/004_sessions_nearby.sql` – RPC function for nearby search (used by web + mobile)

Migration `005_sessions_created_by.sql` is no longer needed as `created_by` is now in the main schema.

Enable RLS if desired and add policies (examples are commented in the migration files).

## Deploy

Web (Vercel):

- Set env vars for the project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_EMAILS`
- Deploy with default Next.js settings

Mobile (EAS preview):

- Add an `eas.json` and ensure `EXPO_PUBLIC_SUPABASE_*` are set in your build profiles
- Build: `eas build -p ios` (and/or android)

## Contributing

- Typecheck before pushing: `pnpm --filter ./apps/doWhat-web exec tsc --noEmit && pnpm --filter ./apps/doWhat-mobile exec tsc --noEmit`
- Keep migrations alongside the app; apply in Supabase SQL editor.
