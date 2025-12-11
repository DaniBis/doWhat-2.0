# Engineering Roadmap — December 2025

This roadmap reflects the current state of branch `feature/admin-dashboard-docs` and outlines the next major efforts to close remaining gaps across mobile, web, shared packages, and Supabase.

## 0. Social Sweat Core Transformation (New High Priority · Est. 3–4 sprints)
- **Objective:** Reframe doWhat into "Social Sweat" by layering sport-specific onboarding, reliability scoring, and hyperlocal discovery without regressing existing flows.
- **Schema & Data Foundations (Sprint 1):**
	- Ship migration `035_social_sweat_core.sql` introducing profile reliability columns, sport metadata, attendance enums, `session_open_slots`, and (per architecture review) a dedicated `user_sport_profiles` table so trait vibes remain decoupled from structured skill data.
	- Regenerate Supabase types plus shared TypeScript enums immediately so web/mobile compile before new UI lands.
		- ✅ 10 Dec: Centralized the Social Sweat sport/play/attendance enums + labels in `@dowhat/shared`, re-exported them via `apps/doWhat-web/src/types/database.ts`, and updated the host attendance UI to consume the shared helpers.
	- Add seed + rollback scripts plus health checks inside `database_updates.sql` to keep deploy parity.
- **Shared Core Modules (Sprint 1–2):**
	- Stand up `packages/shared/src/sports`, `scoring/reliability.ts`, and `recommendations/rankSessions.ts` with exhaustive Jest coverage.
	- Move palette/spacing tokens into `packages/shared/theme` to prevent Next.js vs Expo drift when new Sport/Skill chips land.
- **Onboarding + Creation (Sprint 2):**
	- Web + mobile onboarding steps for Sport & Skill use the shared taxonomy and persist into `user_sport_profiles`/profiles in lockstep.
	- `/admin/new` gains "Looking for Players" inputs that create `session_open_slots` rows alongside sessions, guarded by feature flags until QA.
- **Discovery & Reliability (Sprint 3):**
	- Mobile home feed surfaces "Find a 4th Player" cards ranked via the shared scorer; map remains secondary to avoid the "ghost town" effect in new cities.
	- ✅ Host attendance tooling (`SessionAttendancePanel`) now records definitive statuses via a host-only roster, the companion API (`/api/sessions/[id]/attendance/host`) enforces host auth + writes `session_attendees`, and a Postgres trigger (`036_attendance_reliability_trigger.sql`) clamps reliability scores immediately; the GPS verification signal now shows up in attendance badges/analytics so “verified matches” are both visible and tracked.
- **Validation & Pilot (Sprint 4):**
	- `scripts/seed_social_sweat.ts` populates Bucharest pilot data for E2E + ranking tests.
	- Reliability badge components (web + RN) and Skill chips reuse shared tokens; analytics dashboards track adoption before public launch.
	- Architecture guardrails: run telemetry on fake-session risk, ensure open-slot RLS policies are exercised via Playwright + Jest.

## 1. Complete Session Attendance Migration (High Priority · Est. 3–4 days)
- Replace all RSVP-era APIs/components (`RsvpBox`, `RsvpQuickActions`, `/api/rsvps`, etc.) with the new `session_attendees` tables and views delivered via migrations `027–030`.
- Ensure host actions, attendee badges, caps, and session detail pages on both platforms rely on the same data joins.
- Add targeted integration tests for attendance toggles, capacity checks, and saved sessions to prevent regressions.
	- ✅ Added Jest coverage for the `/attendance/join` + `/attendance/leave` routes so auth failures, capacity enforcement, and success payloads stay regression-safe while we continue iterating on the remaining Step 1 tasks.
	- ✅ Added matching coverage for `/attendance/host` (GET + POST) so host-only roster access, verified toggles, and Supabase update flows stay locked down.
	- ✅ Added RTL coverage for `SessionAttendancePanel` so the host roster UI, verified badge, and “Record attendance” action remain regression-safe.
	- ✅ Added Jest coverage for the `/my/attendance` page so the saved-session list honors Supabase auth, hydrates attendee rows, optimistically toggles statuses, and surfaces query/mutation errors when the browser client fails.

## 2. Stabilize Saved Activities Context (High Priority · Est. 1–2 days)
- Fix the TypeScript issues in `apps/doWhat-mobile/src/contexts/SavedActivitiesContext.tsx` so typecheck/CI passes.
- Mirror the refined context logic on the web (or extract core helpers into `packages/shared`) to keep save/unsave flows in sync.
- Add unit tests around metadata normalization, optimistic updates, and fallback handling.
- **Update · 4 Dec:** Added a dedicated RN Jest suite (`src/contexts/__tests__/SavedActivitiesContext.test.tsx`) plus a Jest alias for `@dowhat/shared`, so the mobile provider now has coverage for optimistic saves, fallbacks, and unsave toggles.
- **Update · 9 Dec:** Extended the web provider suite (`apps/doWhat-web/src/contexts/__tests__/SavedActivitiesContext.test.tsx`) with per-table select errors plus a fallback-read test, proving the context walks through `READ_SOURCES` and reprioritizes legacy write targets when Supabase views go missing.
- **Update · 9 Dec (mobile):** Mirrored the fallback-read coverage in `apps/doWhat-mobile/src/contexts/__tests__/SavedActivitiesContext.test.tsx`, ensuring the RN provider also advances through `READ_SOURCES` and prefers the legacy write target when `user_saved_activities_view` errors.
- **Update · 11 Dec:** Introduced the shared `trackSavedActivityToggle` helper in `packages/shared/src/analytics.ts`, instrumented both SavedActivities providers with platform/source-aware telemetry, and added Jest coverage on web + mobile so every save/unsave event now emits analytics with consistent metadata.

## 3. Ship Trait Onboarding & Profile Flows (High Priority · Est. 3 days)
- Wire the existing trait APIs into real onboarding/profile experiences on both mobile and web.
- Ensure Supabase schema (`021_user_trait_vibe_system.sql`) is exercised end-to-end with proper RLS/policies.
	- Detailed validation plan now lives in `docs/trait_policies_test_plan.md`; run that script matrix before sign-off.
- Document the UX flows and add regression tests covering trait creation, editing, and personalization hints.
	- **Update · 9 Dec:** Added Jest coverage for `src/app/onboarding/traits/page.tsx`, dynamically importing the server component so mocked Supabase auth + `next/navigation.redirect` hooks apply, and asserting unauthenticated users redirect to `/auth/login` while signed-in members see the Step 3 checklist/CTA block.
	- **Update · 9 Dec:** Landed CTA regression tests on the profile traits tab and Smart Filters page (web + mobile). The new Expo suites stub Supabase auth/count queries, mock the popular traits fetch, and wrap React Native Animated warnings so the "Finish your base traits" banner only appears when fewer than five base traits exist, regardless of platform.
	- **Update · 9 Dec:** Hardened the mobile trait selector with RN Jest coverage (`apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`), mocking safe areas/router, enforcing the five-trait cap, validating the insert/RPC fan-out on save, and asserting the "Please sign in again" error when Supabase auth is missing.

## 4. Achieve Web/Mobile Feature Parity (Completed · 6 Dec 2025)
- **Status (6 Dec 2025):** Parity guardrails, docs, and Playwright suites are now in place across admin new/sessions/dashboard/venues plus the venue verification tooling, so work can shift to Step 5.
- Saved Activities parity is now complete across mobile, web, admin dashboards, and venue verification via the shared `@dowhat/shared` payload builders.
- Regression tests now cover the shared adapters (ActivityCard, ActivityScheduleBoard, venue save helper) plus the SavedActivitiesContext snapshots, and these suites now run inside the default `pnpm -w run test` CI step.
- Shared taxonomy + filter constants now live in `packages/shared` (taxonomy exports, `preferences/activityFilterOptions.ts`), and both Activity Filter screens consume the same distance/price/time presets so Supabase preferences stay canonical.
- The web People Filter now embeds the shared taxonomy picker + presets (and mobile pulls from the shared skill/age/group lists), keeping its Activity tab aligned with the main filter screen.
- Admin dashboard filters now expose the shared taxonomy/time-of-day presets so hosts can review sessions/venues with the same knobs as consumers.
- The `/admin/new` session flow now embeds the shared taxonomy picker, hydrates existing activity tags, and persists the selected tier3 ids so newly created sessions keep their `activity_types` metadata aligned with consumer discovery surfaces.
- Venue verification deep-links now carry the selected taxonomy tier3 id + source metadata into `/admin/new`, and the admin form surfaces a contextual prefill banner/summary/reset control so hosts understand and can clear the imported filters before publishing.
- The create-event prefill helpers now live in `apps/doWhat-web/src/lib/adminPrefill.ts`, emit both single + multi `categoryIds`, and have Jest coverage to keep host tooling links + banners stable.
- The admin sessions dashboard and manage table now surface "Plan another" links on every row using `buildSessionCloneQuery`, letting ops jump into `/admin/new` with the session’s activity, venue, taxonomy, coordinates, and price prefilled.
- `/admin/sessions` now has RTL coverage to keep the clone links + unauthorized gate stable while we iterate on host tooling.
- The main `/admin` dashboard now has RTL coverage guarding its Plan another links (ensuring venue addresses/coords flow into `buildSessionCloneQuery`) and the allowlist gate.
- Added dedicated Jest coverage for the session clone helper path so future host-tooling tweaks don’t regress the deep links wiring.
- `/admin/new` now has RTL coverage around the prefill banner + summary plus the "Clear prefills" control, so multi-category clones and reset behavior stay regression-safe while we keep iterating on host tooling.
- The `/admin/new` summary now echoes any prefilled `venueAddress` even when no venue id/name is passed, and the amber warning banner now triggers for address- or coordinate-only prefills so ops still confirm the location when clone links omit other venue metadata.
- `/admin/new` now surfaces an amber warning when prefills arrive without venue addresses or coordinates, nudging ops to verify the location context from clone links before publishing.
- `/admin/new` now shows prefilled coordinates in the summary even when clone links only provide one of latitude/longitude, surfacing a placeholder for the missing value so ops immediately spot incomplete venue data.
- Added a Playwright smoke suite (`apps/doWhat-web/tests/e2e/health.spec.ts`) plus repo-level config so `npx playwright test --project=chromium` spins up the Next dev server, hits `/api/health`, and fails fast if the host tooling surfaces ever regress the health endpoint.
- Added a Playwright admin gate suite (`apps/doWhat-web/tests/e2e/admin-gate.spec.ts`) that loads `/admin`, `/admin/sessions`, and `/admin/new` without auth to ensure the allowlist guardrail stays intact during future host-tooling edits.
- Added a `/admin/venues` Playwright flow (`apps/doWhat-web/tests/e2e/admin-venues-manage.spec.ts`) that seeds Supabase auth, mocks venues/save endpoints, skips the allowlist via the `NEXT_PUBLIC_E2E_ADMIN_BYPASS` flag, and now verifies the inline “Add venue” form, the search empty state, and delete interactions end-to-end.
- The map popup now renders taxonomy badges derived from the shared tier3 index (via `activityCategoryLabels.ts`), keeping the discovery/saved experiences consistent with the Activity Filter presets while we finish the remaining Step 4 parity polish.
- The venue verification taxonomy filtering now lives in `apps/doWhat-web/src/lib/venues/taxonomySupport.ts` with Jest coverage, so the ACTIVITY_NAMES allowlist and tier3 pruning stay in sync with the shared taxonomy/library while we iterate on host map tooling.
- Venue verification Save payloads now flow through `apps/doWhat-web/src/lib/venues/savePayload.ts` (with Jest coverage) so the map list/drawer always emit the canonical metadata consumed by Saved Activities and the admin dashboards.
- Added RTL coverage for `apps/doWhat-web/src/app/venues/page.tsx` (status filter chips + Save/plan CTA wiring) using `@testing-library/user-event`, keeping the host verification parity work regression-safe while we finish the remaining Step 4 polish.
- The venue verification suite now also simulates vote success + 401 auth errors, asserting the `/api/vote-activity` flow updates counts, shows the success toast, and prompts sign-in when needed.
- The host venue verification map now surfaces the shared taxonomy picker (limited to supported activities) plus the shared distance presets, so ops review AI venues with the exact knobs consumers have on Activity Filters.
- Keep auditing discovery, session detail, map, and saved-activity experiences for any remaining host tooling gaps (tie up map detail popovers + saved lists as needed).
- Next focus: shift into Step 5 (Supabase migrations hardening) and Step 6 (admin monitoring) now that Step 4 guardrails + documentation are landed.

## 5. Harden Supabase Migrations & Seeds (Medium Priority · Est. 1 day)
- Validate migrations `025–031` against the live Supabase project, including rollback scripts and seed helpers.
- Update `database_updates.sql` and docs so deployment instructions match the new schema pipeline.

## 6. Extend Admin Monitoring & Moderation (Completed · 6 Dec 2025)
- Enhanced the `/admin` dashboard with search, shared taxonomy filters, growth highlight cards, and an embedded audit feed backed by `admin_audit_logs`.
- Added audit prompts + logging for in-dashboard deletes and mirrored the same traceability inside `/api/cleanup` so destructive API actions capture scope + counts.
- Shipped migration `034_admin_audit_logs.sql` plus a guarded export endpoint (`/api/admin/audit-logs`) that returns JSON or CSV downloads for allowlisted admins; future monitoring tweaks are now incremental.

## 7. Documentation & Change Tracking (Ongoing)
- Keep `ASSISTANT_CHANGES_LOG.md` and `docs/current_app_overview_2025-12-03.md` synchronized after every change to prevent context loss.
- Summarize completed roadmap items and note testing/migration follow-ups as they land.

This roadmap will evolve as features land; revisit after each milestone to reprioritize remaining work.