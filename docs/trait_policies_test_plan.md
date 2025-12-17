# Trait Policy Validation Plan

Goal: prove the Supabase trait schema (migration 021) enforces the intended access model before declaring Step 3 done. The scenarios below can run against the local Supabase stack (`pnpm supabase start`) or any staging project by swapping the Supabase URL/key pairs referenced in `scripts/health-env.mjs`.

## How to Run the Automated Checks

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/verify-trait-policies.mjs
```

The script seeds disposable users/sessions and walks through the matrix below, reporting any failures alongside automatic cleanup. It requires at least two traits in the catalog and leaves the database in its original state when successful.

## Actors & Credentials

| Actor | Auth token | Description |
| --- | --- | --- |
| Anonymous user | none | Expect read-only access to `traits` and `user_trait_summary`, no other capabilities. |
| Authenticated member (User A) | anon key + member session | Should read/write only their `user_base_traits`, read their votes, insert votes that meet checks, and call onboarding RPC path. |
| Other member (User B) | second session | Used to assert cross-user isolation. |
| Service role | service key | Full access expected; used to seed data/reset between tests. |

Generate tokens with `pnpm --filter scripts run health-env` or Supabase dashboard. Store sessions using `supabase.auth.signInWithPassword` inside the scripted checks.

## Test Matrix

### 1. Trait Catalog (`public.traits`)
- [ ] Anonymous `select * from traits limit 1` succeeds.
- [ ] Anonymous `insert` or `update` fails with RLS error.
- [ ] Service role `insert/update/delete` succeeds to confirm admin policy path.

### 2. Base Trait Ownership (`public.user_base_traits`)
- [ ] User A inserts five rows via onboarding RPC (`persistTraitSelection` flow) and can read them back.
- [ ] User B cannot `select` rows where `user_id = User A` (expect 0 rows / RLS error if using direct SQL).
- [ ] User A cannot insert/update rows using `user_id = User B` (expect RLS error).
- [ ] Anonymous caller receives RLS error when selecting or mutating.
- [ ] Service role truncate + reseed works to reset between runs.

### 3. Trait Votes (`public.user_trait_votes`)
- Precondition: create a session with `session_attendees` rows for both users and mark it ended (`ends_at < now() - 24h`).
- [ ] User A inserts a vote for User B with a catalog trait — expect success.
- [ ] Repeat insert before session ends -> expect policy rejection (fails `exists sessions ... ends_at <= now() - 24h`).
- [ ] User A tries to vote targeting a session lacking mutual attendance -> expect rejection.
- [ ] User B attempts to query votes where they are neither `to_user` nor `from_user` -> expect 0 rows / RLS error.

### 4. Trait Summary (`public.user_trait_summary`)
- [ ] Anonymous `select` succeeds (public read).
- [ ] Authenticated insert/update/delete fails (policy denies writes); only service role should mutate this table directly.
- [ ] `increment_user_trait_score` call from User A succeeds (function is `security definer` and granted to `authenticated`). Verify row delta.

### 5. RPC Surface (`increment_user_trait_score` and onboarding flow)
- [ ] Call RPC as User A for one of their base traits and assert `score`, `base_count`, `vote_count` values match deltas.
- [ ] Attempt RPC from anonymous context -> expect `401`/auth error.
- [ ] Run the mobile onboarding flow (see `apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`) against a mocked Supabase client seeded with policy-success responses. For end-to-end confidence, run `apps/doWhat-mobile/src/lib/supabase.ts` against the dev Supabase instance and confirm five trait insertions followed by RPC calls succeed using the same session tokens as above.

## Automation Outline

1. Helper script `scripts/verify-trait-policies.mjs` already seeds disposable users/sessions, runs the matrix using `@supabase/supabase-js`, and emits pass/fail summaries (see command above).
2. `pnpm -w run health` now calls `scripts/health-trait-policies.mjs`, which runs the verifier whenever Supabase credentials are present (and skips with a note otherwise), so the standard health check surface flags policy drift automatically.
3. Document real test outputs (SQL + HTTP responses) in `docs/current_app_overview_2025-12-03.md` after the first successful run.

## UX Flow & Regression Coverage

In addition to the Supabase policy checks above, keep the following Jest suites green so the full trait experience (creation, editing, and personalization hints) stays regression-safe:

- **Onboarding gate** — `apps/doWhat-web/src/app/onboarding/traits/__tests__/page.test.tsx` proves unauthenticated visitors are redirected to `/auth/login` while signed-in members see the Step 3 layout (CTA pill, checklist, and embedded selector).
- **Creation + editing** — `apps/doWhat-web/src/components/traits/__tests__/TraitSelector.test.tsx` covers catalog fetches, five-trait enforcement, successful submissions, and now re-opening slots by deselecting saved traits so members can edit their vibe stack at any time. Run via `pnpm --filter dowhat-web test -- TraitSelector`.
- **Trait onboarding redirect** — `apps/doWhat-web/src/components/traits/__tests__/TraitOnboardingSection.test.tsx` asserts the selector completion routes members back to the appropriate profile tab (default and custom landing paths).
- **Personalization hints** — `apps/doWhat-web/src/app/people-filter/__tests__/page.test.tsx` (the `describe('PeopleFilterPage personalization hints', …)` block) ensures the Nearby Traits grid renders real `/api/traits/popular` data, falls back to the canned hints when the endpoint fails, and keeps the onboarding nudges pointing at `/onboarding/traits`.

Together with the policy verifier, these suites document and guard the UX flows that Roadmap Step 3 calls for.

## Exit Criteria

- All matrix checks pass against staging/local.
- Evidence captured (script output attached to PR or noted in docs).
- Onboarding UI + RPC path observed working with real Supabase responses (not just mocked Jest).
- Roadmap Step 3 updated to reflect the validation status.
