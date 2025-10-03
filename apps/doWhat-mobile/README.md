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

For real devices set EXPO_PUBLIC_WEB_URL to your laptop LAN IP: http://<LAN-IP>:3002

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

## Troubleshooting
- Stuck connecting: ensure Metro still running; no Ctrl+C in that window.
- Supabase auth errors: check you replaced placeholder keys.
- Device cannot reach API: set EXPO_PUBLIC_WEB_URL to reachable host/IP.
- iOS network errors: confirm you rebuilt after ATS changes.
