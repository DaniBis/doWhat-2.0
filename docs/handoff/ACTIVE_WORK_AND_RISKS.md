# Active Work, Risks, and File-by-File Notes

*14 Dec 2025 status:* Sprint 5’s roadmap mandates (notification engine, WhatsApp card, trust & safety suite) are now fully complete. The sections below remain for audit trail and future reference, but no additional execution tasks are pending beyond the watchlist items.

## 1. Current Branch Snapshot (`feature/admin-dashboard-docs`)
`git status -sb` shows extensive in-progress edits (web + mobile onboarding, admin tooling, scripts, docs). Many files are modified or newly added; no commits yet in this session.

### Key Modified Areas (high-level)
- `apps/doWhat-web/src/components/profile/*` — onboarding banners restyled with shared theme tokens; Jest suites updated.
- `apps/doWhat-web/src/components/nav/OnboardingNavLink.tsx` — nav CTA styling + telemetry guard.
- `apps/doWhat-web/tailwind.config.js`, `src/app/globals.css` — Tailwind now imports `@dowhat/shared` theme tokens.
- `packages/shared/src/theme.ts` — palette + spacing exports, rem helpers.
- `scripts/seed-social-sweat.mjs`, new `scripts/social-sweat-shared.mjs`, `scripts/rollback-social-sweat.mjs` — doWhat pilot tooling refactor.
- Docs (`README.md`, `docs/migrations_025-031_validation.md`, `docs/social_sweat_pilot_validation.md`) updated with new workflow instructions.

## 2. Active Initiatives & Status
| Initiative | Files | Status | Notes |
| --- | --- | --- | --- |
| Shared theme adoption | `packages/shared/src/theme.ts`, `apps/doWhat-web/tailwind.config.js`, `globals.css`, onboarding banners/nav | In progress | Reliability stack (`SessionAttendancePanel`/`List`), `ActivityCard`, `EmailAuth`, the home verification hero, profile traits/badge surfaces, `AuthButtons`, and `SportSelector` now use the shared tokens; reran `pnpm -w run typecheck`, `pnpm -w run lint`, and the Step 0 CTA suites (`profile` + `SportSelector`) on 13 Dec to validate the sweep; continue auditing discovery/profile pages for stray Tailwind emerald/amber utilities. |
| Step 0 CTA parity | `apps/doWhat-web/src/components/profile/*`, nav link tests, `packages/shared/src/onboarding/*` | Guardrails in place | Ensure any new CTA uses `trackOnboardingEntry` with `steps`, `pendingSteps`, `nextStep`. |
| doWhat pilot seeding | `scripts/seed-social-sweat.mjs`, `scripts/social-sweat-shared.mjs`, `scripts/rollback-social-sweat.mjs`, README/docs | Complete & documented | Verify new rollback script in staging; ensure `pnpm health` references stay consistent. |
| Notification engine (Twilio SMS) | `apps/doWhat-web/supabase/migrations/039_notification_outbox.sql`, `supabase/functions/notify-sms/index.ts`, `supabase/config.toml`, README, `supabase/functions/notify-sms/schedule.sql`, `scripts/health-env.mjs`, `scripts/health-notifications.mjs` | In progress | Outbox table + trigger landed, the Edge Function polls Twilio with per-session rate limiting, JWT enforcement is now disabled via `supabase/config.toml`, pg_cron wiring lives in `supabase/functions/notify-sms/schedule.sql`, and `pnpm health` now jumps through env validation plus a notification-specific health script (stale pending + recent failures) unless `NOTIFICATION_TWILIO_STUB=true` is set for local dry runs. Next follow-ups: run the SQL per-environment and add integration/Twilio mocks as time permits. |
| doWhat adoption metrics | `apps/doWhat-web/supabase/migrations/038_social_sweat_adoption_metrics.sql`, admin page | Partially landed | Need to confirm migration is applied, admin cards hitting new view, tests updated (`apps/doWhat-web/src/app/admin/__tests__/page.test.tsx`). |
| Mobile onboarding parity | `apps/doWhat-mobile/src/app/onboarding/*`, nav pill/prompt components, RN tests | Recently updated | Re-run `pnpm --filter doWhat-mobile test -- ...` before merge; ensure Expo Router layout changes committed. |
| Find a 4th Player hero | `apps/doWhat-mobile/src/app/home.tsx`, `components/FindA4thHero.tsx`, `hooks/useRankedOpenSessions.ts` | Complete | Home screen now consumes `useRankedOpenSessions`, renders the hero carousel, emits Find-a-4th impression/tap telemetry, and is guarded by `home.findA4th.test.tsx`. |
| Release checklist execution | Repo-wide | In progress | `pnpm -w run lint`, `pnpm -w run typecheck`, and the full workspace Jest command (`pnpm test -- --maxWorkers=50%`, 76 suites) are green, and the 10-spec Playwright suite (`pnpm --filter dowhat-web exec playwright test`) passed on 13 Dec; continue rerunning Expo Doctor before releases now that the repo is managed-only. |
| Playwright scope/env fix | `playwright.config.ts`, `apps/doWhat-web/tests/e2e/*` | Complete | Runner now loads `.env.e2e(.local)` files, injects Supabase defaults, scopes to `apps/doWhat-web/tests/e2e/**`, ignores unit tests, defaults to port 4302, and the `/admin/new` open-slot spec intercepts the session detail fetch so deleting the new session no longer spams server logs. Keep that Playwright port free (or override it) before executing the suite. |
| Repo lint cleanup | `apps/doWhat-mobile/src/app/onboarding/index.tsx`, `apps/doWhat-mobile/src/hooks/useOnboardingProgress.ts`, `apps/doWhat-mobile/src/app/home.tsx` | Complete | Deleted unused onboarding helpers/imports so eslint no longer surfaces warnings; `pnpm -w run lint` is clean. |
| Expo Doctor warning follow-up | `apps/doWhat-mobile/app.config.js`, native folders | Complete | Adopted a fully managed workflow by deleting `apps/doWhat-mobile/ios` + `android` (regenerate via `expo prebuild` when building). Expo Doctor now passes; release checklist notes the regeneration command. |

## 3. Known Issues / Risks
1. **Playwright server contention:** Runner now scopes to the 10 admin e2e specs, injects Supabase env defaults, defaults to port 4302, and the `/admin/new` open-slot spec intercepts `/sessions/session-e2e-open` so deleting sessions during the run no longer spams server fetch errors. `pnpm --filter dowhat-web exec playwright test` will still fail if another process already occupies 4302; free the port or export a different `PLAYWRIGHT_PORT` before rerunning e2e tests.
2. **Expo prebuild workflow:** Native folders are no longer tracked; engineers must run `pnpm --filter doWhat-mobile exec expo prebuild --clean --platform ios android` (or the platform-specific variant) before cutting an EAS build so app config changes propagate to native code.
4. **Large dirty tree:** Many files modified; ensure targeted commits or stash before context resets. Coordinate merges to avoid conflicts.
5. **Theme rollout partial:** Mixed palettes can cause inconsistent UI if components still carry tailwind emeralds. Continue auditing after each sweep.
6. **Supabase migrations:** After editing `038_social_sweat_adoption_metrics.sql`, run `pnpm run db:migrate` against dev DB and update docs with validation queries.
7. **Mobile router changes:** `_layout` and new onboarding components added; ensure navigation works on device/emulator before release.

## Decision Note: Expo Doctor Workflow (Managed Only)

- 13 Dec 2025 — Adopted the managed workflow permanently: removed `apps/doWhat-mobile/ios` and `apps/doWhat-mobile/android` from source control and added them to `.gitignore`.
- Regenerate native projects on demand with `pnpm --filter doWhat-mobile exec expo prebuild --clean --platform ios android` (or per-platform variants) before running EAS builds or local native testing.
- Document this requirement in any release checklist so contributors remember to prebuild and commit generated artifacts only when absolutely necessary. This keeps Expo Doctor green while preventing config drift between `app.config.js` and native code.
- 14 Dec 2025 — Revalidated the workflow by running `pnpm --filter doWhat-mobile exec npx expo-doctor` immediately after the Expo Jest suite; the command now reports **15/15 checks passed**, confirming the managed-only setup stays healthy between releases.

## 4. Testing Expectations Before Merge
- `pnpm --filter dowhat-web run typecheck`
- `pnpm --filter dowhat-web test -- OnboardingProgressBanner SportOnboardingBanner ReliabilityPledgeBanner OnboardingNavLink`
- `pnpm --filter dowhat-web test -- admin` (to cover adoption cards and prefill flows)
- `pnpm --filter doWhat-mobile test -- onboarding-index onboarding-sports profile.simple.cta OnboardingNavPrompt OnboardingNavPill people-filter`
- `pnpm test:onboarding-progress` (chains the web OnboardingProgressBanner + people-filter suites with the Expo onboarding hub/profile/nav CTA/people-filter suites) — last executed on **14 Dec 2025**, all Step 0 CTA tests passed.
- `pnpm --filter @dowhat/shared test` — last executed on **14 Dec 2025**, 8 suites/48 tests passed (taxonomy, onboarding, reliability, recommendations helpers).
- `node scripts/verify-trait-policies.mjs` (requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — re-ran on **14 Dec 2025** using the newly shared service-role credentials for `kdviydoftmjuglaglsmm`; every catalog/base trait/vote/RPC check returned `ok`.
- `pnpm health` (validates migrations, doWhat data)
- `pnpm --filter dowhat-web exec playwright test` (defaults to port 4302; override `PLAYWRIGHT_PORT` only if that port is busy) — last executed on **14 Dec 2025**, all 10 admin specs passed in ~17s after binding the dev server to 4302.
- `pnpm --filter doWhat-mobile exec npx expo-doctor` (managed-only repo; expect **15/15 checks passed** and regenerate native folders with `pnpm --filter doWhat-mobile exec expo prebuild --clean --platform ios android` before EAS builds)

## 5. Suggested Next Steps
1. **Keep Playwright runs isolated** — make sure port 4302 is free (stop `web:dev` or export a new `PLAYWRIGHT_PORT`) before running `pnpm --filter dowhat-web exec playwright test`; the new intercept keeps `/admin/new` deletes from spamming errors, so failures now point to real regressions.
2. **Decide on Expo Doctor warning** — either delete `ios/`/`android/` folders (managed workflow) or document manual config syncing before cutting an EAS build.
3. **Wire notify-sms cron** — store the Supabase project URL + `NOTIFICATION_ADMIN_KEY` in Vault and run `supabase/functions/notify-sms/schedule.sql` against each environment so pg_cron calls the Edge Function every minute without needing a Supabase JWT.
4. **Monitor Find a 4th inventory** — keep the doWhat seed fresh (`pnpm seed:social-sweat && pnpm verify-social-sweat`) so the ranked hero carousel always has open slots to highlight.
5. **Complete theme migration** — continue auditing remaining components for legacy colors/spacings, convert to shared Tailwind tokens.
6. **Stabilize branch** — once features ready, commit in logical chunks (shared theme, onboarding restyles, doWhat scripts) to simplify review.
7. **Documentation refresh** — after merging, update roadmap (Step 0 progress, Find a 4th status) and current app overview snapshot.

## 6. Hand-off Pointers for Another AI/Developer
- Use `docs/handoff/PROJECT_OVERVIEW.md` for overall architecture.
- Reference this file for in-flight work and test expectations.
- Sync with `ASSISTANT_CHANGES_LOG.md` for chronological context when preparing release notes.
- Always run `pnpm health` before sharing environments—this catches Supabase drift and ensures doWhat pilot data is seeded/verified.

## Adoption Metrics Validation Checklist (Migration 038)
- [ ] **Apply migration in dev:** From repo root run `pnpm run db:migrate` with local `DATABASE_URL` pointing to your dev Supabase instance; verify the script reports migration `038_social_sweat_adoption_metrics.sql` applied or already present.
- [ ] **Apply migration in staging:** Export `DATABASE_URL` for the staging database and run the same `pnpm run db:migrate` command; capture the migration log in release notes.
- [ ] **Confirm view output:** In psql (or Supabase SQL editor) execute `SELECT * FROM public.social_sweat_adoption_metrics;` and ensure the single row returns non-null counts for `total_profiles`, `sport_step_complete_count`, and related columns.
- [ ] **Verify admin dashboard cards:** Load `/admin` and confirm the “doWhat Readiness” panel renders the Sport & Skill, Skill Level Saved, Trait Goal (5), Reliability Pledge, and Fully Ready cards using the view data.
- [ ] **Run Jest coverage:** Execute `pnpm --filter dowhat-web test -- admin` to cover `apps/doWhat-web/src/app/admin/__tests__/page.test.tsx`, specifically the “renders doWhat adoption metrics…” and “shows an empty state…” suites that exercise the view wiring.
