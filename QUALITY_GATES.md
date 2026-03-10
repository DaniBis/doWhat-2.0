# doWhat Quality Gates

Every future implementation pass must clear these gates or explicitly state why it is partial.

## Gate 1 — Scope Clarity

- The pass must have one real objective.
- “Improve the app” is not a valid objective.
- The touched surfaces and expected outcome must be named before implementation.

## Gate 2 — Build Health

Run the smallest truthful verification set for the touched area:

- typecheck
- lint
- relevant unit/integration tests
- relevant scripts or health checks

If a full repo run is not feasible, say exactly why and run the narrowest credible subset.

## Gate 3 — Product Truth

- No fake placeholders on the touched surface.
- No fake hardcoded results.
- No UI that claims behavior the backend does not support.
- No visible filter, badge, count, or state unless it maps to real data or deterministic derived logic.
- No hidden fallback behavior on user-facing critical paths.

## Gate 4 — Regression Safety

- Every bug fix must add or update regression coverage where feasible.
- Every contract change must update tests or verification scripts.
- If coverage is not added, the reason must be stated explicitly.

## Gate 5 — Logging

For every meaningful pass:

- `changes_log.md` updated
- `ASSISTANT_CHANGES_LOG.md` updated
- `error_log.md` updated if the work addressed a real failure or runtime issue

No silent fixes.

## Gate 6 — Verification

The final report must include:

- exact commands run
- exact outcomes
- what passed
- what was not run
- remaining risks

“Looks good” is not verification.

## Gate 7 — Honest Completion

- Partial work must be called partial.
- “Done” is only allowed when the intended scope was actually verified.
- Unknowns must be named.
- Work blocked by missing environment access must be called blocked, not finished.

## Anti-hallucination Operating Rules

Future AI passes must:

- read current logs and relevant docs before changing code
- distinguish facts from inference
- list exact files changed
- list exact commands run
- list exact test outcomes
- state remaining unknowns and risks
- never claim “done” without verification
- never hide fallback behavior
- never leave visible UI that is not connected to real backend logic
- never silently keep a placeholder if the real feature is not working
- never describe remote deployment status without an actual remote check

## Reusable Pass Template

Use this structure for future work:

1. Objective
   - one explicit goal
   - touched surfaces
   - expected user-facing outcome
2. Read first
   - logs
   - relevant docs
   - relevant code/tests
3. Audit
   - what is true now
   - root cause or current gap
4. Decision
   - what will change
   - what will not change
   - why
5. Implementation
   - exact files
   - exact semantic changes
6. Verification
   - exact commands
   - exact outcomes
7. Risks
   - remaining unknowns
   - follow-up if needed
8. Logging
   - append all meaningful steps to both logs

## Reusable Completion Checklist

- Scope was explicit before implementation.
- Relevant logs/docs were read first.
- Root cause or actual gap was identified.
- Files changed are listed.
- No fake UI or fake data remains on the touched surface.
- Verification commands were run and recorded.
- Regression coverage was added or updated where feasible.
- Remaining risks are stated honestly.
- `changes_log.md` is updated.
- `ASSISTANT_CHANGES_LOG.md` is updated.
- `error_log.md` is updated if applicable.

## Suggested Default Verify Order

Start narrow and truthful:

1. targeted tests for touched files
2. package-level typecheck
3. package-level lint or targeted eslint
4. relevant verification scripts
5. broader health runs only when the touched scope justifies them

When in doubt, prefer a smaller honest verification set over a larger unverified claim.
