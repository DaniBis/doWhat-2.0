# Error Log

## 2025-12-06 – Trait onboarding foreign key failure (RESOLVED)
- **Surface**: iOS dev client (Expo) during onboarding trait save step.
- **Symptom**: Supabase returned `23503` (`user_base_traits.public_user` violates foreign key) when saving the first trait selection.
- **Root cause**: The onboarding flow was inserting into `user_base_traits` before the public user row existed.
- **Fix**: Updated `apps/doWhat-mobile/src/app/onboarding-traits.tsx` to call `ensure_public_user_row` (RPC) before saving traits and to retry once if Supabase still reports `23503`.
- **Status**: Verified via automated tests (`apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`) and manual iOS smoke test.

## 2025-12-06 16:40 UTC – `/api/health` reports `user_traits` table unavailable (OPEN)
- **Surface**: `curl http://localhost:3002/api/health` while Next.js API server was running on port 3002.
- **Symptom**: Endpoint returned `{"ok":false,"supabase":true,"tables":{"user_badges":true,"traits_catalog":true,"user_traits":false,"badges":true,"trait_events":true},"missing":["user_traits"]}`.
- **Impact**: Indicates backend cannot reach the `user_traits` table; APIs that read/write user trait rows may fail.
- **Follow-up**: Re-tested at 19:05 UTC after mobile client rebuild; endpoint still reports `user_traits` missing.
- **Next steps**: Inspect Supabase migrations against local database, ensure `user_traits` exists and credentials have access, rerun migrations if needed.

## 2025-12-06 19:00 UTC – Expo inspector overlay auto-opening (RESOLVED)
- **Surface**: iOS dev client displayed the Inspector/Perf/Touches bar on every launch, obstructing onboarding QA.
- **Root cause**: `EX_DEV_CLIENT_NETWORK_INSPECTOR` defaulted to `true` in `android/gradle.properties` and `ios/Podfile.properties.json`, so the dev menu tools auto-mounted.
- **Fix**: Set the property to `false` for both platforms and rebuilt the native dev client (removed `.native-dev-client-signature` + reran `pnpm --filter doWhat-mobile run start:ios`).
- **Status**: Verified on iPhone 16 Pro simulator; no overlay appears when the bundle loads.
