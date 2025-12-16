# doWhat / doWhat — Project Overview

## 1. Mission & Product Pillars
- **doWhat transformation:** shift doWhat into a sport-first community where members complete Step 0 onboarding (traits → sport/skill → reliability pledge) before hosts prioritize them for open slots.
- **Host & ops tooling:** `/admin` dashboards, session creation, and verification flows ensure ops can manage supply and monitor adoption.
- **Discovery surfaces:** consumer web/mobile apps expose activity filters, people filters, saved activities, and the “Find a 4th Player” experience (in-flight) powered by shared ranking logic.
- **Telemetry & guardrails:** onboarding CTAs, saved-activity toggles, and host attendance UIs emit analytics via shared helpers to keep feature adoption measurable.

## 2. Monorepo Structure
```
apps/
  doWhat-web/        # Next.js 14 (App Router) targeting web + admin
  doWhat-mobile/     # Expo Router (React Native) for iOS/Android
packages/
  shared/            # Cross-platform TypeScript helpers, tokens, analytics
scripts/             # Health checks, seeding, verification, rollback
supabase/            # SQL migrations executed via run_migrations.js
```
Additional top-level assets include docs (roadmap, validation guides), tsconfig, lint config, and Supabase helpers.

## 3. Core Applications
### 3.1 Web (Next.js)
- **Routes:** App Router under `apps/doWhat-web/src/app`. Key paths: `/`, `/onboarding/*`, `/people-filter`, `/admin/*`, `/map`, `/profile`, `/api/*` for serverless handlers.
- **State/Data:** Supabase client (browser + server) for auth and data fetching. Server components pull data with RLS-safe selects. Client components (banners, nav, forms) hydrate via hooks.
- **UI:** TailwindCSS + Radix-inspired components. Theme now sources tokens from `@dowhat/shared/src/theme.ts` (colors, spacingRem, typography). Shared onboarding components reused across surfaces.
- **Admin tooling:** `/admin`, `/admin/new`, `/admin/sessions`, `/admin/venues`, `/admin/activities` integrate host workflows (prefills, taxonomy pickers, clone links). Playwright specs cover allowlist gating + creation flows.

### 3.2 Mobile (Expo / React Native)
- **Router:** Expo Router with tabs under `apps/doWhat-mobile/src/app/(tabs)`, plus onboarding stack under `/app/onboarding/*`.
- **Features:** Home feed, Find a 4th hero (partial), saved activities context, people filter, onboarding CTAs (profile banners, nav pill, nav prompt). Shared onboarding progress hook ensures parity with web.
- **Testing:** Jest + React Native Testing Library suites under `src/app/__tests__`, `src/components/__tests__`, covering onboarding flows, people filter, saved activities.

### 3.3 Shared Package (`@dowhat/shared`)
- **Exports:** Theme tokens, analytics trackers, onboarding helpers (`derivePendingOnboardingSteps`, `hasCompletedSportStep`), sports taxonomy, scoring/recommendations (`rankSessionsForUser`, reliability), saved-activity payload builders, config data.
- **Build/Test:** `pnpm --filter @dowhat/shared build/test`. Output consumed by both apps.

## 4. Backend & Data Layer
- **Supabase:** Acts as primary backend (Postgres + auth + storage). Accessed via `@supabase/supabase-js` from both apps and scripts.
- **Migrations:** Located in `apps/doWhat-web/supabase/migrations/025+`. Managed via `pnpm run db:migrate`. Key doWhat files: `035_social_sweat_core.sql`, `036_attendance_reliability_trigger.sql`, `037_reliability_pledge_ack.sql`, `038_social_sweat_adoption_metrics.sql` (in-progress).
- **Types:** `apps/doWhat-web/src/types/database.ts` auto-generated + manually extended to include new tables/enums.

## 5. Scripts & Automation
- `scripts/health-env.mjs`, `scripts/health-migrations.mjs`, `scripts/health-trait-policies.mjs`, `scripts/verify-social-sweat.mjs` — form `pnpm health` guardrail.
- `scripts/seed-social-sweat.mjs` — seeds Bucharest pilot. Shared definitions live in `scripts/social-sweat-shared.mjs`. Deterministic IDs ensure idempotency.
- `scripts/rollback-social-sweat.mjs` — removes pilot data (sessions, slots, venues, activities, profiles, auth users).
- `scripts/seed-places-bangkok.mjs`, `scripts/seed-events-bangkok.mjs`, `scripts/seed-activity-taxonomy.mjs` — legacy demo data helpers.

## 6. Feature Highlights & Status
| Area | Highlights | Status |
| --- | --- | --- |
| **Onboarding (Step 0)** | Shared progress helpers, profile banners, nav pill/prompt, CTA telemetry, onboarding hub parity, sport selector, reliability pledge. | Implemented + fully tested. Theme refresh ongoing. |
| **Admin Tooling** | Prefill-aware `/admin/new`, Looking for Players open-slot creation + rollback, doWhat adoption cards (SQL view), allowlist gating, e2e Playwright coverage. | Landed, small polish ongoing. |
| **Saved Activities** | Shared payload builders, doc’d health workflow, parity across web/mobile contexts, telemetry instrumentation. | Complete (Step 2). |
| **Attendance & Reliability** | Trigger-based scoring, host roster UI, verified badge analytics, removal of RSVP legacy flows. | Complete (Step 1). |
| **doWhat Seeds & Validation** | Pilot seeding, verification, rollback, docs. Ensures Find a 4th data always available. | Complete & documented. |
| **Find a 4th Player** | Shared `rankSessionsForUser` ready; mobile hero/cards partially styled, awaiting final data hook + telemetry. | Next major roadmap task. |

## 7. Testing & Quality Gates
- **Unit/Integration:** Jest for shared package, web (RTL), mobile (RNTL). Focused commands documented in README and roadmap.
- **E2E:** Playwright specs for admin gate, admin new open slots, venues, sessions, health.
- **CI Plan:** `pnpm -w run typecheck`, `pnpm -w run lint`, `pnpm -w run test`, `pnpm --filter dowhat-web run build`, health endpoint poll.

## 8. Documentation Footprint
- `ENGINEERING_ROADMAP_2025.md` — current priorities + history.
- `docs/current_app_overview_2025-12-03.md` — feature map + guardrails.
- `docs/migrations_025-031_validation.md` — migration/seed validation steps.
- `docs/social_sweat_pilot_validation.md` — pilot seeding + verification runbook.
- `ASSISTANT_CHANGES_LOG.md` — AI change log of recent contributions.

## 9. Environment & Config
- **Env Vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_ADMIN_EMAILS`, feature flags (`EXPO_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS`, `NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS`).
- **Scripts:** `dev:web`, `dev:mobile`, `pnpm health`, `pnpm seed:social-sweat / verify / rollback`.

## 10. Outstanding Work / Next Steps
1. **Mobile Find a 4th Player hero:** hydrate ranked sessions via shared scorer, ensure CTA flows to session detail, add telemetry/tests.
2. **Theme token rollout:** continue replacing legacy emerald/amber utility classes across admin/map components with shared palette.
3. **doWhat adoption metrics:** finalize `038_social_sweat_adoption_metrics.sql` integration (web admin cards + docs).
4. **Codebase cleanup:** large unstaged diff suggests ongoing edits—stabilize before merging.

This overview should give any AI/dev an immediate sense of architecture, functionality, and roadmap focus. For change-by-change history, reference `ASSISTANT_CHANGES_LOG.md` and commit history on `feature/admin-dashboard-docs`.
