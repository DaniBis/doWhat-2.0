# doWhat Roadmap

## Current Stage

doWhat is in **foundation stabilization**, not real-user readiness.

What is true right now:

- Discovery, filter semantics, and activity-first product boundaries have been tightened in code.
- Web/mobile parity is improved, but the final filter UX redesign is still pending.
- Remote Supabase discovery migrations are still behind (`060`, `065`, `066`, `067`, `068` were last confirmed missing remotely).
- Live post-deploy performance verification is not complete.
- Event creation, hosting truth, and attendance reliability still need explicit end-to-end hardening before the product can be called trustworthy.

This roadmap is the current operating sequence. It supersedes the old lightweight roadmap and should be updated whenever priorities or gates change.

## Sequencing Rules

Dependency order:

`A -> B -> C -> D -> E -> F -> G -> H -> I`

Meaning:

- Do not ship UX polish on top of undefined semantics.
- Do not ship new discovery behavior without verified data truth.
- Do not call a phase done because a UI looks better.
- Do not start real-user readiness work while remote migrations, discovery truth, and reliability truth are unresolved.

## What Must Not Be Worked On Yet

Until the earlier phases are truly closed, do not spend time on:

- generic restaurant/cafe/bar/nightlife discovery
- speculative broad SQL rewrites
- personalization/recommendation systems that sit on unstable discovery truth
- growth loops or notifications beyond operational hardening
- visual redesigns that are not backed by real backend behavior
- monetization, partnerships, or marketplace flows

## AI Operating Model

- **Codex**
  - Owns scoped multi-file implementation, refactors, tests, logs, verification, and delivery discipline.
  - Must read current logs/docs first, state exact files touched, run relevant checks, and report remaining risks honestly.
- **Copilot**
  - Inline assistant only.
  - Good for local completions, repetitive edits, and tactical suggestions inside an already-defined implementation plan.
  - Must not be treated as a substitute for repo audit, verification, or delivery accountability.
- **Optional second AI**
  - Reviewer/auditor only.
  - Can challenge assumptions, spot regressions, or review diffs.
  - Must not act as an uncontrolled parallel co-builder.

## Phase A — Operating System / Delivery Discipline

**Status:** active in this pass

- Goal
  - Give the repo a truthful operating layer: roadmap, current-state snapshot, bug register, quality gates, discovery truth, and filter contract.
- Why it matters
  - The repo had working code and logs, but the control layer was fragmented, stale, and easy for future AI passes to misread.
- Key deliverables
  - `ROADMAP.md`
  - `CURRENT_STATE.md`
  - `OPEN_BUGS.md`
  - `QUALITY_GATES.md`
  - `DISCOVERY_TRUTH.md`
  - `FILTER_CONTRACT.md`
- Validation criteria
  - The files exist at repo root.
  - They describe the actual 2026 repo state rather than old 2025 plans.
  - They tell future contributors what is working, blocked, and forbidden.
- Risks
  - If these docs drift from code/log truth, they become another layer of confusion.
- Do not move forward until
  - The operating files are created, specific, and referenced in future work.
- Quality expectations
  - No generic templates. No vague claims. No unsupported “done” language.

## Phase B — Discovery Truth / Data Truth

**Status:** in progress, not closed

- Goal
  - Make discovery behavior and inventory truth measurable, explainable, and deployable.
- Why it matters
  - Discovery is the core product surface, and recent work proved that weak provider matching, remote migration drift, and legacy venue fallbacks can distort what users see.
- Key deliverables
  - Remote rollout of missing discovery migrations.
  - Verified discovery contract scripts and post-deploy SQL checks.
  - Documented activity-first discovery rules.
  - Cleanup/rematch plan for stale hospitality-first activity mappings.
- Validation criteria
  - Remote schema is aligned with repo migrations.
  - Post-deploy checks pass.
  - Key cities and key intents return plausible, activity-first inventory.
- Risks
  - Remote data may still carry older `venue_activities` matches.
  - No live plan verification means performance assumptions can still be wrong.
- Do not move forward until
  - The target Supabase environment is current and discovery checks pass after rollout.
- Quality expectations
  - No fake venues, no generic hospitality discovery, no hidden fallback behavior.

## Phase C — Filter Foundation

**Status:** largely implemented, needs sustained verification

- Goal
  - Normalize one shared typed filter contract across web, mobile, and backend discovery.
- Why it matters
  - Filters were previously split across multiple models and UI-only semantics.
- Key deliverables
  - Shared normalized discovery filter contract.
  - Web/mobile/backend alignment.
  - Removal of placeholder “temporarily unavailable” filter states.
  - Regression coverage for filter semantics and parity.
- Validation criteria
  - Supported filters map to real query behavior.
  - Unsupported filters are removed from production surfaces.
  - Active chips and reset behavior are honest.
- Risks
  - `/api/events` now enforces an explicit subset of the shared contract, but it still does not have full parity with place/activity discovery.
- Do not move forward until
  - The shared contract is treated as canonical and no UI lies about applied filters.
- Quality expectations
  - Deterministic defaults, explicit OR/AND rules, no duplicate semantic controls.

## Phase D — Filter UX Redesign

**Status:** next product-facing phase after foundation stability

- Goal
  - Redesign the filter experience on top of the stabilized contract.
- Why it matters
  - The contract is much healthier now, but the user-facing experience still needs clearer grouping, better prioritization, and stronger discoverability.
- Key deliverables
  - Shared UX rules for web/mobile.
  - Better grouping of “what / who / trust / sort”.
  - Strong active-chip visibility and reset behavior.
  - No unsupported controls on any surface.
- Validation criteria
  - Users can understand what is being filtered without guessing.
  - Web/mobile semantics remain aligned.
  - No placeholder copy or empty panels reappear.
- Risks
  - A purely visual redesign could drift from backend truth if done carelessly.
- Do not move forward until
  - Discovery truth and filter contract remain stable during the UX pass.
- Quality expectations
  - UX must reflect real schema/query behavior, not aspirational behavior.

## Phase E — Event Creation / Hosting Truth

**Status:** not closed

- Goal
  - Make creation, hosting, and event/session modeling trustworthy for real usage.
- Why it matters
  - Users need to know whether they are creating a session, surfacing an ingested event, or hosting a real activity at a valid place.
- Key deliverables
  - Clear user-facing event/session model.
  - Reliable create/edit flows.
  - Honest place/host attachment rules.
  - Contract between event discovery and event creation surfaces.
- Validation criteria
  - Newly created community events reliably appear in the correct discovery surfaces.
  - Host metadata and place metadata are not contradictory.
- Risks
  - The repo still mixes `events` and `sessions` in user-facing event discovery.
- Do not move forward until
  - Event creation and event discovery do not contradict each other.
- Quality expectations
  - No “created successfully but not visible” behavior. No ambiguous entity model.

## Phase F — Attendance / Reliability Truth

**Status:** partially implemented, not operationally closed

- Goal
  - Make attendance, reliability, disputes, and participation state trustworthy enough for real social use.
- Why it matters
  - Reliability is product-critical if users are meant to show up for real activities.
- Key deliverables
  - Verified attendance flows.
  - Clear reliability semantics.
  - Working disputes / moderation follow-through.
  - Health checks that match production reality.
- Validation criteria
  - Reliability state changes are explainable and verifiable.
  - Attendance data does not silently desync between surfaces.
- Risks
  - Historical trait/reliability issues show this area is fragile when migrations or policies drift.
- Do not move forward until
  - Reliability data is operationally trusted, not just locally green.
- Quality expectations
  - No invisible policy failures, no fake attendance states, no silent background errors.

## Phase G — Web/Mobile Parity

**Status:** in progress

- Goal
  - Make discovery, filters, logos, result counts, and event/session behavior meaningfully aligned across web and mobile.
- Why it matters
  - The repo is already cross-platform; drift across clients creates product inconsistency and duplicated debugging cost.
- Key deliverables
  - Shared contract usage.
  - Shared ranking/filter semantics where intended.
  - Platform-specific UI differences only where justified.
- Validation criteria
  - Same city + same filter intent produce comparable results.
  - No platform-specific fake counts or unsupported filters.
- Risks
  - Mobile performance constraints can tempt silent degradation.
- Do not move forward until
  - Major discovery/filter semantics are shared or explicitly documented when they differ.
- Quality expectations
  - Differences must be deliberate, documented, and tested.

## Phase H — Performance / Observability

**Status:** partially prepared, not fully measured

- Goal
  - Make discovery fast, explainable, and observable in both local and remote environments.
- Why it matters
  - The repo now has better scripts and migrations, but the target environment still lacks full rollout and live explain-plan evidence.
- Key deliverables
  - Remote migration alignment.
  - Post-deploy explain/measurement loop for hot queries.
  - Diagnostics for filter stages, dedupe counts, and cache use.
- Validation criteria
  - Hot paths are measured in a real environment.
  - Slow or weak stages are visible, not guessed.
- Risks
  - Without remote rollout, performance work can become speculative.
- Do not move forward until
  - The target database matches the expected migration baseline.
- Quality expectations
  - Performance claims must include actual measurements, not impressions.

## Phase I — Real-User Readiness Gate

**Status:** blocked by earlier phases

- Goal
  - Decide whether doWhat is ready for real-world usage in a limited geography and audience.
- Why it matters
  - The product must cross from internal iteration to something people can actually trust.
- Key deliverables
  - Clear go/no-go gate.
  - Verified discovery quality in target cities.
  - Verified event creation and attendance truth.
  - Verified mobile/web parity and operational playbook.
- Validation criteria
  - Critical/high bugs are either closed or explicitly accepted with mitigation.
  - Quality gates pass on the release candidate.
  - Human-run production checks are complete.
- Risks
  - Premature launch with unstable discovery or event truth will destroy trust quickly.
- Do not move forward until
  - Phases A through H are closed enough to support a real-user pilot.
- Quality expectations
  - “Ready” must mean verified by product behavior, data truth, and operational checks.
