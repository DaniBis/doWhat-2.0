# doWhat Mobile

Expo (dev-client) app in the monorepo.

## Environment Variables

Copy an example and fill in real values:
```
cp .env.local.example .env.local
# edit .env.local
```
Required:
- EXPO_PUBLIC_SUPABASE_URL (e.g. https://xyzcompany.supabase.co)
- EXPO_PUBLIC_SUPABASE_ANON_KEY
Optional:
- EXPO_PUBLIC_WEB_URL (defaults to http://localhost:3002)
- EXPO_PREFER_LAN (set to `1` when you want the dev server + API base URL to bind to your LAN IP automatically)

For real devices you can either set `EXPO_PUBLIC_WEB_URL` manually or export `EXPO_PREFER_LAN=1` so our `start-ios.sh` helper resolves the active Wi-Fi interface and keeps the Expo dev server + API calls reachable from the phone.

## Rebuild Dev Client After Native Changes

When Info.plist / permissions / icons / splash / ATS or plugin config changes:
```
cd apps/doWhat-mobile
npx expo run:ios
npx expo run:android   # optional
```

## Starting Metro With Stable Env
From repo root (ensures Node via nvm + pnpm + adb reverse):
```
pnpm -w run dev:mobile:env
```
Keep this terminal open; use a new terminal for other commands.

### Quick launch helpers
- Simulator: `pnpm --filter doWhat-mobile run start:ios` (clears stale Metro ports, boots the iOS simulator, and starts the Expo dev client on localhost:8081).
- Physical device on the same Wi‑Fi: `EXPO_PREFER_LAN=1 pnpm --filter doWhat-mobile run start:ios` (automatically advertises the LAN IP and points `EXPO_PUBLIC_WEB_URL` at it so the native app can reach the Next.js dev API as well).

## Troubleshooting
- Stuck connecting: ensure Metro still running; no Ctrl+C in that window.
- Supabase auth errors: check you replaced placeholder keys.
- Device cannot reach API: set EXPO_PUBLIC_WEB_URL to reachable host/IP or re-run `start-ios.sh` with `EXPO_PREFER_LAN=1` to auto-detect.
- iOS network errors: confirm you rebuilt after ATS changes.
- Map screen relies on Google Maps; set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) before running on a device or emulator.
