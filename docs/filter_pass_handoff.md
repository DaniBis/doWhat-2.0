# Filter Pass Handoff

This handoff assumes the team is finishing the moderate SQL/discovery path first and is **not** doing a broad SQL rewrite.

## Safe Baseline Assumptions

- `places` remains the canonical place model.
- Discovery ranking, trust scoring, and dedupe remain code-driven for now.
- Migration `068_discovery_query_support_indexes.sql` exists in the repo but is not yet confirmed on the target remote project.
- `scripts/health-migrations.mjs` now detects the discovery-critical remote drift and fails loudly when the required migrations are missing.
- [discovery_remote_rollout_pack.md](/Users/danielbisceanu/doWhat/docs/discovery_remote_rollout_pack.md) and [discovery-postdeploy-checks.sql](/Users/danielbisceanu/doWhat/scripts/sql/discovery-postdeploy-checks.sql) define the human-run remote rollout and verification flow.
- This pass did not intentionally change discovery ranking/filter semantics.

## What Still Blocks the Filter Pass

- The target remote project still needs migrations `060`, `065`, `066`, `067`, and `068` applied.
- There is still no live post-`068` `EXPLAIN ANALYZE` or equivalent plan verification from the target environment.
- Filter semantics remain split across UI controls, API query contracts, and some runtime fallback behavior.
- Web and mobile now share more discovery logic than before, but the filter contract is still not fully explicit or documented end-to-end.

## Filter Issues To Tackle Next

- Define one shared filter contract for web and mobile:
  - search text
  - activity taxonomy
  - verified/trust flags
  - price levels
  - distance / bounds intent
  - open-now / time windows
  - people or social fit filters
- Decide explicit semantics for multi-select filters:
  - OR vs AND for activity categories
  - how text search combines with taxonomy
  - what counts as verified
  - when people filters are eligible
- Remove or reduce UI-only filter behavior that is not reflected in the query contract.
- Rebuild the filter UX on top of the shared contract only after the contract is stable.

## Recommended Next Pass

The next pass should be **API/query contract cleanup**, not UI-only polish and not a full schema redesign.

Reason:

- The current blocker is not the schema itself; it is that filter behavior is still not fully unified between web, mobile, and backend discovery inputs.
- A UI-only pass would risk making the controls nicer without fixing semantics.
- A full redesign would be premature before the post-`068` baseline is deployed and measured.

## Exact Next Task

1. Apply remote migrations and complete the rollout pack.
2. Re-run health and post-deploy verification.
3. Document the canonical shared filter contract.
4. Then redesign the filter UI on top of that contract.
