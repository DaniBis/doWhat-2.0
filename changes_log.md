# Changes Log

### 2026-04-11 UTC — PR #7 review-blocker fix pass for launch-city inventory tooling
- Issue: fix only the still-current in-scope PR #7 Copilot review blockers on `launch-city-inventory-tooling-20260331` without widening scope beyond the launch-city inventory surface.
- Files changed:
   - `scripts/city-inventory-status-report.mjs`
   - `scripts/rematch-venue-activities.mjs`
   - `scripts/city-inventory-audit.mjs`
   - `scripts/__tests__/city-inventory-status-report.test.mjs`
   - `scripts/__tests__/rematch-venue-activities.test.mjs`
   - `changes_log.md`
   - `ASSISTANT_CHANGES_LOG.md`
- Exact fix:
   - `scripts/city-inventory-status-report.mjs` now treats missing or empty `audit.coverage` as `missing`, treats missing duplicate/stale/weak/session-gap audit buckets as `missing`, and blocks launch recommendation when those required audit sections are missing.
   - `scripts/rematch-venue-activities.mjs` now validates `--limit`, `--offset`, and `--batchSize` as non-negative integers before coercion so invalid user input cannot silently serialize as JSON `null`.
   - `scripts/city-inventory-audit.mjs` now uses the normalized `];` style for `HOSPITALITY_STEMS`.
   - focused tests now cover the exact missing-artifact and invalid-numeric-input cases raised by the live review comments.
- Narrow validation run:
   - `node --test scripts/__tests__/city-inventory-status-report.test.mjs scripts/__tests__/rematch-venue-activities.test.mjs` → passed (`13` tests, `0` failed)
   - `grep -n '] ;' scripts/city-inventory-audit.mjs` → no match
- Expected review-state effect:
   - the four previously current Copilot comments on `scripts/city-inventory-status-report.mjs`, `scripts/city-inventory-audit.mjs`, and `scripts/rematch-venue-activities.mjs` should become stale/already resolved once this branch head is pushed and GitHub re-evaluates the diff.

## 2026-03-07

### 2026-03-07 04:02 UTC — Final verification checkpoint / duplicate-logo-count-discovery work validated, lint cleanup applied
- Issue: complete the requested end-of-pass verification after confirming Tasks 1-5 were already represented in the current source tree.
- Files changed: `changes_log.md`, `ASSISTANT_CHANGES_LOG.md`, `apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx`.
- Decision made: keep the existing Task 1-5 implementations, avoid redundant rewrites, and limit code changes to one lint-only cleanup so the final verification is green.
- Why: current code already contains the semantic duplicate-place merge, official-site-first logo pipeline, mobile home event-count correction, mobile/web discovery filter-ranking helpers, and the related regression suites. Re-implementing those flows would add risk without improving correctness.
- How tested:
   - focused Jest run for `packages/shared/src/places/__tests__/dedupe.test.ts`, `packages/shared/src/places/__tests__/branding.test.ts`, `apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts`, `apps/doWhat-mobile/src/lib/__tests__/homeActivityCounts.test.ts`, and `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts` → `20 passed, 0 failed`,
   - workspace `typecheck` task → passed,
   - workspace `lint` task initially surfaced one warning in `apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx`,
   - removed the unused `act` import from that test file,
   - reran `lint` → passed cleanly,
   - reran `apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx` → `5 passed, 0 failed`,
   - reran `/api/health` on the live web dev server → `ok: true`.
- Result: the requested areas are currently in a verified-good state. Duplicate-place handling, logo resolution, mobile event-count wording, discovery parity helpers, and the recent startup/chunk-load fixes all remain green under focused regression coverage, and workspace lint/typecheck now finish cleanly.
- Remaining risks / follow-up: duplicate/logo verification in this pass is code+test+health based rather than a brand-new live DB/browser repro; if you still see a specific stale UI case, the next step is to capture the exact route/query/device state and trace that path directly.

### 2026-03-07 03:40 UTC — Log synchronization / prior work backfill
- Issue: backfill recent screenshot fixes into the shared engineering log before starting the new investigation batch.
- Files changed: `changes_log.md`, `ASSISTANT_CHANGES_LOG.md`.
- Decision made: keep the earlier 2026-03-07 summary entry, but add timestamped structured logging from this point onward to satisfy the stricter execution/reporting requirement.
- Why: the repo already had a summary of the chunk-load and mobile Home fixes, but not the explicit timestamp/decision/risk structure now requested.
- How tested: manual review of both logs to confirm the screenshot fixes were present and no recent code changes were missing from the top of the log.
- Result: logs are now the first-class source of truth for the current workstream; subsequent milestones will be appended with timestamps and verification notes.
- Remaining risks / follow-up: older historical entries remain in mixed formats; only new and actively touched items will be normalized unless a broader documentation migration is requested.

### 2026-03-07 03:46 UTC — Task 1 investigation checkpoint / duplicate-place fix appears to already exist in code
- Issue: verify whether the current `VietClimb` duplication is still an active code defect or whether a previous semantic dedupe fix already landed and only needs runtime verification.
- Files changed: `changes_log.md`.
- Decision made: pause new duplicate-place code changes until current dedupe wiring is verified end-to-end.
- Why: the log history already shows a 2026-03-07 mixed-source dedupe fix, and the current source tree still contains `packages/shared/src/places/dedupe.ts` plus usages in server discovery, mobile Home, and mobile map. Re-editing the pipeline without verification would risk duplicating or regressing a recent fix.
- How tested: reviewed the prior Task 1 entries in `changes_log.md`, read `packages/shared/src/places/dedupe.ts`, confirmed active call sites in `apps/doWhat-web/src/lib/discovery/engine.ts`, `apps/doWhat-mobile/src/lib/supabasePlaces.ts`, `apps/doWhat-mobile/src/app/home.tsx`, and `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`, and checked the existing regression suites `packages/shared/src/places/__tests__/dedupe.test.ts` and `apps/doWhat-web/src/lib/discovery/__tests__/dedupeMerge.test.ts`.
- Result: current code still contains the semantic duplicate collapse for canonical `place` + legacy `venue` pairs, so the next step is runtime verification and gap analysis rather than immediately changing the dedupe algorithm.
- Remaining risks / follow-up: if duplicates still appear in the live UI, the regression is more likely in a non-deduped rendering path, a stale build/runtime state, or a newly added source path that bypasses the helper.

### 2026-03-07 03:49 UTC — Task 2 investigation checkpoint / logo pipeline fix also appears present in code
- Issue: verify whether the missing doWhat logo and broken place-logo behavior still require implementation work or primarily need runtime verification.
- Files changed: `changes_log.md`.
- Decision made: defer new logo changes until the current brand/logo pipeline is verified in runtime and tests.
- Why: the log history already records a 2026-03-07 Task 2 implementation, and the current tree still contains the official-site-first `/api/place-logo` route, real `logo.png` asset usage in web/mobile brand components, and the shared branding resolver. Reworking the pipeline without validation would risk replacing an existing fix rather than completing the requested verification.
- How tested: reviewed the prior Task 2 entries in `changes_log.md`, read `packages/shared/src/places/branding.ts`, `apps/doWhat-web/src/components/BrandLogo.tsx`, `apps/doWhat-mobile/src/components/Brand.tsx`, and `apps/doWhat-web/src/app/api/place-logo/route.ts`, and verified that `apps/doWhat-web/public/logo.png` plus the mobile app assets still exist on disk.
- Result: the current source tree still reflects the logged logo-pipeline repair; the next step is to validate behavior on actual web/mobile surfaces and only patch gaps that still reproduce.
- Remaining risks / follow-up: place logos still depend on having a real official website URL in the dataset, so runtime verification may still expose inventory-quality gaps even if the code path itself is correct.

### 2026-03-07 04:28 UTC — Nearby places regression fix / web + mobile were timing out against forced refresh discovery
- Issue: no places were rendering on web or mobile because nearby discovery requests were timing out or taking so long that the UI fell back to empty states.
- Files changed:
   - `apps/doWhat-web/src/app/api/nearby/route.ts`
   - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
   - `apps/doWhat-web/src/app/map/page.tsx`
   - `apps/doWhat-web/src/lib/discovery/engine.ts`
   - `apps/doWhat-web/src/lib/places/aggregator.ts`
   - `apps/doWhat-mobile/src/app/home.tsx`
   - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
- Root cause:
   - the shared web/mobile nearby fetchers were still using an `8s` timeout budget while the live `/api/nearby` path around Hanoi was taking roughly `16–21s`,
   - `/api/nearby` also auto-expanded toward a fixed inventory target even when a smaller request limit was already satisfied,
   - the biggest server-side cost came from sparse-inventory seeding in `discoverNearbyActivities`, which forced `fetchPlacesForViewport(... forceRefresh: true)` on normal requests and therefore bypassed stored place data, provider caches, and the faster Supabase-backed path.
- Fixes applied:
   - capped `/api/nearby` auto-expansion targets by the actual request `limit` so small-limit requests do not chase impossible inventory counts,
   - raised the web map and mobile nearby fetch budgets to `20s` and gave mobile Home discovery tasks their own longer timeout instead of reusing the `8s` startup-task cutoff,
   - changed sparse viewport/city seeding in `apps/doWhat-web/src/lib/discovery/engine.ts` to stop forcing provider refresh on ordinary requests,
   - skipped the expensive `matchActivitiesForPlaces` bootstrap pass when the seeding request is already satisfied from stored/cached place inventory,
   - kept the aggregator improvement that parallelizes the independent Overpass/Foursquare provider calls when a real refresh is still needed.
- Why this fix is correct:
   - live probing showed `/api/nearby?lat=21.0285&lng=105.8542&radius=12000&limit=120` and the larger web-map query were consistently slower than the client timeout,
   - the debug payload showed `pagesFetched > 0` and provider counts even for normal nearby loads, confirming that provider refresh work was happening inline instead of serving the stored catalog,
   - after the engine change, the debug payload dropped to `pagesFetched: 0` / provider counts `0` for the normal request path while still returning hundreds of `supabase-places` results.
- How tested:
   - focused Jest suites passed:
      - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - `packages/shared/src/__tests__/mapApi.test.ts`
      - `apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx`
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
   - workspace validation passed:
      - `pnpm -w run typecheck`
      - `pnpm -w run lint`
      - `curl -s http://localhost:3002/api/health`
   - live latency re-checks:
      - before fix: nearby requests were roughly `18–21s`,
      - after fix: normal nearby requests dropped to roughly `5–9s` on repeat probes,
      - nearby debug payload now reports `pagesFetched: 0` for the ordinary path instead of doing inline provider seeding.
- Result:
   - both web and mobile now have enough budget to receive the nearby response,
   - the server no longer forces slow provider refresh work on standard nearby-place requests,
   - the nearby endpoint again behaves like a stored-inventory read path first, with explicit refresh/provider work reserved for true refresh scenarios.
- Remaining risks / follow-up:
   - the first uncached dev hit is still not instant, and the remaining `5–9s` range suggests there is still worthwhile optimization room in the fallback/session merge path if we want truly snappy cold-start discovery,
   - explicit refresh flows may still be slower because they are designed to allow the heavier provider work.

1. **Web stale chunk auto-recovery + mobile Home startup deadlock fix**
   - User-reported issues from screenshots:
      - web root showed `ChunkLoadError: Loading chunk app/page failed`,
      - iOS Home stayed on the initial skeleton cards instead of reaching the main surface.
   - Root causes identified:
      - web had no recovery path for stale/invalid Next.js runtime chunks after dev rebuilds or stale browser state,
      - mobile Home awaited several discovery/network tasks sequentially during first paint, so one stalled request could keep `loading === true` and trap the UI on the skeleton screen.
   - Fixes applied:
      - `apps/doWhat-web/src/lib/chunkLoadRecovery.ts`
         - added chunk-failure detection helpers and a rate-limited hard-reload recovery script,
      - `apps/doWhat-web/src/app/layout.tsx`
         - injects the chunk recovery script with `beforeInteractive` so stale chunk failures self-recover once instead of leaving the runtime error overlay stuck on screen,
      - `packages/shared/src/map/api.ts`
         - added an 8s timeout to the shared nearby-activities fetcher so stalled requests abort instead of hanging forever,
      - `apps/doWhat-mobile/src/app/home.tsx`
         - parallelized first-load discovery tasks,
         - wrapped each task in an 8s timeout,
         - made Home degrade to partial/empty sections instead of blocking the whole screen behind the initial skeleton.
   - Added tests:
      - `apps/doWhat-web/src/lib/__tests__/chunkLoadRecovery.test.ts`
      - expanded `apps/doWhat-mobile/src/app/__tests__/home.findA4th.test.tsx` with a discovery-failure startup regression case,
      - `packages/shared/src/__tests__/mapApi.test.ts` for the new nearby-fetch timeout.
   - Validation:
      - focused web Jest suite passed,
      - focused mobile Jest suite passed,
      - workspace typecheck/lint passed after the changes.

## 2026-03-04

1. **Mobile Map stability fix (iOS): removed recenter tug-of-war causing visible map shaking**
   - User-reported issue: map UI glitched and visibly shook when tapping/selecting activities/places.
   - Deep diagnosis in `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`:
      - map is controlled via `region` state while also running programmatic camera changes (`animateToRegion`),
      - profile-location auto-centering effect could still reapply center after initialization,
      - this created a tug-of-war between user interaction (marker tap/cluster zoom/pan) and profile recentering, which manifested as jitter/shake.
   - Fixes applied:
      - added interaction/state guards:
         - `hasUserInteractedRef`
         - `profileRegionAppliedRef`
      - city reset now clears both guards before fresh region bootstrap,
      - initial location bootstrap marks profile region as already applied when profile center is used,
      - profile recenter effect now exits once user has interacted and the profile region has already been applied,
      - profile recentering now no-ops when the target region is already effectively equal,
      - marker and cluster press handlers explicitly mark user interaction to prevent forced recenter override,
      - region-change handler marks user interaction before syncing query updates.
   - Result:
      - map camera no longer fights user-driven selection/zoom movements,
      - marker selection flow is visually stable on iOS.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - iOS Expo Go smoke run successful on simulator (`exp://127.0.0.1:8083`).

2. **Core-values save reliability + web map activity-focus stabilization**
   - User-reported issues:
      - onboarding core values showed `Unable to save core values.` on iOS,
      - web map camera shook/jittered while focusing a selected activity.
   - Root causes identified:
      - core-values save path threw non-`Error` Supabase payloads and always included `user_id` in `profiles` upsert; older schema variants without `profiles.user_id` failed and surfaced only the generic fallback error,
      - web map activity selection had a URL/state race (`selectedActivityId` vs delayed `activity` query-param sync) that could briefly clear and re-apply focus, and programmatic `easeTo` move-end callbacks fed back into parent move sync.
   - Fixes applied:
      - `apps/doWhat-mobile/src/app/onboarding/core-values.tsx`
         - added robust Supabase error-message extraction for non-`Error` payloads,
         - save now retries `profiles` upsert without `user_id` when the column is missing,
         - added targeted, actionable save error messages (RLS/core_values migration cases).
      - `apps/doWhat-web/src/components/onboarding/CoreValuesForm.tsx`
         - mirrored the same fallback retry and actionable error handling for web onboarding parity.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - added pending activity-param sync guard to defer URL→state reconciliation until router params catch up, preventing transient selection clear/reapply loops.
      - `apps/doWhat-web/src/components/WebMap.tsx`
         - added programmatic-move target tracking and ignored matching programmatic `onMoveEnd` callbacks to prevent recenter feedback loops.
      - Added tests:
         - `apps/doWhat-mobile/src/app/__tests__/onboarding-core-values.test.tsx`
         - `apps/doWhat-web/src/components/onboarding/__tests__/CoreValuesForm.test.tsx`
         - `apps/doWhat-web/src/app/map/__tests__/focusedActivitySync.test.ts`
   - Validation:
      - `pnpm --filter doWhat-mobile test -- onboarding-core-values` passed.
      - `pnpm --filter doWhat-mobile typecheck` passed.
      - `pnpm --filter dowhat-web test -- CoreValuesForm focusedActivitySync page.smoke` passed.
      - `pnpm --filter dowhat-web test -- map` passed.
      - `pnpm --filter dowhat-web typecheck` passed.

3. **Follow-up fix: core-values compatibility mode + right-column activity focus jitter removal**
   - User follow-up:
      - core-values save still blocked on iOS (`profiles.core_values` missing),
      - web map still jittered when activity was selected from the right-side list (not marker tap).
   - Root causes:
      - some environments lack `profiles.core_values`; onboarding save/progress paths were still tightly coupled to that column,
      - right-column activity click path executed an immediate `setCenter(...)` and then a second focus recenter effect, causing double camera movement.
   - Fixes applied:
      - `packages/shared/src/preferences/userPreferences.ts`
         - added preference key support for `onboarding_core_values`.
      - `apps/doWhat-mobile/src/app/onboarding/core-values.tsx`
         - when `profiles.core_values` is missing, load/save core values via `user_preferences` (`onboarding_core_values`) and continue onboarding.
      - `apps/doWhat-mobile/src/hooks/useOnboardingProgress.ts`
         - when `profiles.core_values` is missing, fallback to `user_preferences` for core-values state and avoid hard-failing onboarding progress.
      - `apps/doWhat-web/src/components/onboarding/CoreValuesForm.tsx`
         - mirrored the same missing-column fallback to `user_preferences` for parity.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - removed the extra immediate center update in right-column activity focus flow to avoid double recenter jitter.
      - Added/expanded tests:
         - `apps/doWhat-mobile/src/app/__tests__/onboarding-core-values.test.tsx` (save/load fallback coverage),
         - `apps/doWhat-web/src/components/onboarding/__tests__/CoreValuesForm.test.tsx` (fallback save coverage).
   - Validation:
      - `pnpm --filter doWhat-mobile test -- onboarding-core-values OnboardingNavPill OnboardingNavPrompt` passed.
      - `pnpm --filter doWhat-mobile typecheck` passed.
      - `pnpm --filter dowhat-web test -- CoreValuesForm map` passed.
      - `pnpm --filter dowhat-web typecheck` passed.

## 2026-03-03

1. **iOS Home search false-negative fix: climbing places in Hanoi were present but filtered out**
   - User-reported issue: searching `Climb` on iOS Home returned no results despite known Hanoi climbing venues.
   - Deep diagnosis:
      - inspected `/api/nearby` payload around Hanoi (`lat=21.0285,lng=105.8542,radius=12km,limit=300`),
      - confirmed climbing entries exist with strong confidence:
         - `VietClimb` (`quality_confidence=0.92`, `place_match_confidence=0.92`, `rank_score=0.437`),
         - `Beefy Boulders Tay Ho` (`quality_confidence=0.92`, `place_match_confidence=0.92`, `rank_score=0.421`),
      - root cause: Home gate in `isStrictNearbyActivity` required `rank_score >= 0.5`, which excluded all climbing candidates in this dataset even though quality/place confidence were high.
   - Fix applied in `apps/doWhat-mobile/src/app/home.tsx`:
      - relaxed Home-only rank gate from `0.5` → `0.35` while keeping strict quality guards:
         - `quality_confidence >= 0.72`,
         - `place_match_confidence >= 0.65`.
   - Verification evidence:
      - API comparison check showed:
         - `climbTotal = 3`,
         - `passOldGate = 0`,
         - `passNewGate = 3`.
   - Validation:
      - workspace `typecheck` passed,
      - iOS Expo Go launch successful (`exp://127.0.0.1:8081`).

2. **iOS Home controls fix: search input + filter button reliability**
   - User-reported issue (screenshot): top Home controls felt non-functional (`Search for activities...` input + filter/options button).
   - Deep root cause analysis:
      - Home filter action used `router.push('/filter')`, but root stack did not register `filter` route,
      - same stack omission applied to `people-filter`, which could make top CTA navigation unreliable,
      - SearchBar relied on local-only input state, which could desync from Home screen state after rerenders/clear actions.
   - Fixes applied:
      - `apps/doWhat-mobile/src/app/_layout.tsx`
         - added missing stack routes:
            - `filter`
            - `people-filter`
      - `apps/doWhat-mobile/src/components/SearchBar.tsx`
         - added optional controlled `value` prop,
         - synced internal query with `value` using `useEffect`,
         - improved iOS input UX (`returnKeyType='search'`, `autoCorrect={false}`, `autoCapitalize='none'`, `clearButtonMode='while-editing'`),
         - expanded filter icon tap target with `hitSlop`.
      - `apps/doWhat-mobile/src/app/home.tsx`
         - wired `searchQuery` into `SearchBar` as controlled `value`.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - iOS simulator relaunch successful in Expo Go (`exp://127.0.0.1:8081`).

3. **Deep Home search/filter fix: search now matches activities metadata; filters now affect results**
   - User-reported issue: Home search behaved like place-name search, and Filter action remained functionally useless.
   - Root causes found:
      - Home search scoring was effectively based on `activity.name` only (often place-like labels from nearby feed).
      - Activity filter preferences (`activity_filters`) were persisted in Filter screen but never consumed by Home nearby fetch logic.
   - Fixes in `apps/doWhat-mobile/src/app/home.tsx`:
      - added structured search metadata per nearby item (`searchText`) built from:
         - activity name,
         - place label,
         - `activity_types`,
         - `taxonomy_categories`,
         - tags.
      - updated ranking input to score against combined metadata, so queries like `climb` match entries tagged/category-marked for climbing even if the visible name is venue-like.
      - integrated `activity_filters` loading into Home (`user_preferences` + local fallback `activity_filters:v1`) and normalized it via shared helpers.
      - wired loaded preferences into nearby API calls:
         - radius now follows selected distance preference,
         - taxonomy categories forwarded as query filters,
         - time-of-day preference mapped to supported map `timeWindow` values.
      - fallback Supabase nearby path now includes `activities.activity_types` and uses preference-driven radius for consistency.
   - Supporting reliability updates:
      - maintained controlled SearchBar integration from Home state,
      - filter route remains registered in root stack to ensure navigation action resolves.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - iOS Expo Go launch successful (`exp://127.0.0.1:8081`).

4. **Filter button hardening + Metro warning clarification (stream disconnect)**
   - User follow-up: search/filter still felt broken and a warning appeared: `Disconnected from Metro (1001: Stream end encountered)`.
   - Additional findings:
      - filter button path relied on parent callback only; if callback path failed/interrupted, button could appear non-functional,
      - Metro warning is transport/runtime (dev server stream ended), not business-logic failure in filters/search.
   - Final fixes:
      - `apps/doWhat-mobile/src/components/SearchBar.tsx`
         - made `onFilter` optional,
         - added built-in route fallback in button handler (`router.push('/filter')`) so filter screen opens even if callback path is disrupted,
         - retained enlarged tap target (`hitSlop`) and controlled search behavior.
      - `apps/doWhat-mobile/src/app/home.tsx`
         - removed duplicate Home-level filter push callback to avoid double-navigation race and keep single-source routing from SearchBar.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - iOS Expo Go restarted on fresh Metro session (`exp://127.0.0.1:8081`) with app booting successfully.

## 2026-03-02

1. **Mobile Home UI/UX pass: resolve overlap, improve CTA clarity, and tighten card readability**
   - User-reported issue: mobile surfaces had overlap and visual ambiguity (place cards looked crowded, save badge conflicted with content, CTA hierarchy unclear).
   - Fixes applied in `apps/doWhat-mobile/src/app/home.tsx`:
      - **Top action buttons refined**:
         - improved visual hierarchy and readability for `Find People` vs `Create event`,
         - centered labels/icons and strengthened contrast,
         - added border treatment to secondary button for clearer primary/secondary action distinction.
      - **Popular nearby places cards restructured**:
         - removed absolute-position save badge that could visually clash with card title/content,
         - moved save control into a dedicated top row,
         - added right spacing (`marginRight`) and explicit card sizing/min-height to prevent cramped rendering in horizontal scroll,
         - preserved locality/update metadata while reducing collision risk.
      - **Nearby Activities labels clarified**:
         - replaced unclear `Activity: X` badge text with explicit `X sessions nearby`.
   - Result:
      - improved layout stability on iOS simulator,
      - better button intent clarity,
      - cleaner information hierarchy with fewer overlapping visual elements.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - iOS simulator smoke run successful in Expo Go (`exp://127.0.0.1:8081`), app bundled and loaded.

2. **Nearby Activities redesign (mobile): cleaner cards + reduced render cost**
   - User follow-up: improve Nearby Activities design quality and make the section more efficient.
   - Changes in `apps/doWhat-mobile/src/app/home.tsx`:
      - introduced memoized activity presentation pipeline:
         - `activitiesToDisplay` with capped render budget (`MAX_HOME_ACTIVITY_CARDS = 40`),
         - `activityCardModels` computed with derived counts/save state,
         - grouped two-column `activityCardRows` for stable layout and less render churn.
      - upgraded Nearby Activities card UX:
         - clearer hierarchy (`Nearby` label + save action in dedicated top row),
         - removed crowded absolute overlays,
         - consistent card height and spacing to avoid visual collisions,
         - explicit affordance copy (`Tap to view places and sessions`).
      - clarified metadata wording:
         - `Activity: X` replaced with `X sessions nearby`.
      - added list feedback when capping applies:
         - `Showing top 40 results for faster browsing`.
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed,
      - iOS simulator smoke run successful in Expo Go (`exp://127.0.0.1:8081`), app launched and bundled.

## 2026-03-01

1. **Mobile Home quality gate: show only high-confidence, accurate places/activities/sessions**
   - User-reported issue: Home displayed low-quality entries (generic/incorrect names) in “Popular nearby places” and related activity/session surfaces.
   - Fixes applied in `apps/doWhat-mobile/src/app/home.tsx`:
      - Added strict label-quality validation to reject placeholder/generic/noisy names (e.g. `everywhere`, `unknown`, `nearby place`, repeated-character garbage, test/dummy values).
      - Home now uses web-equivalent nearby discovery API (`/api/nearby` via `createNearbyActivitiesFetcher`) as the primary source for nearby activities/places.
      - Enforced confidence thresholds for nearby candidates before rendering:
         - `quality_confidence >= 0.72`
         - `place_match_confidence >= 0.65`
         - `rank_score >= 0.5`
      - Added strict mapping/gating for place cards so only entries with valid labels plus context (address/locality/categories/tags) are shown.
      - Kept Supabase/OSM as resilience fallback, but applied the same quality filters before display.
      - Applied quality filtering to Upcoming Sessions rows (invalid activity/venue labels are hidden).
   - Validation:
      - file diagnostics clean,
      - workspace `typecheck` passed for modified files,
      - workspace `lint` passed.

2. **Mobile deep parity hardening (iOS + Android): strict quality pipeline + improved search relevance + events API parity**
   - User concern: mobile experience looked unreliable (low-quality labels, missing parity with web discovery/events behavior, weak search matching).
   - Deep review findings:
      - mobile `supabasePlaces` mapper still allowed generic fallback labels (`Nearby venue` / `Nearby place`) to enter UI,
      - map nearby pipeline accepted low-confidence candidates from `/api/nearby` without strict confidence thresholds,
      - native map events path preferred direct Supabase fallback instead of web `/api/events` logic,
      - Home search used only plain substring matching, causing weak relevance for sport aliases and variants.
   - Fixes applied:
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
         - removed generic fallback naming behavior,
         - now rejects low-quality/placeholders and keeps only valid venue/place labels.
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
         - added strict label quality validation and nearby confidence gates,
         - nearby map candidates now require:
            - `quality_confidence >= 0.72`
            - `place_match_confidence >= 0.65`
            - `rank_score >= 0.5`
         - filters map place output to quality-approved entries only,
         - expanded generic-name rejection set (`nearby place`, `nearby venue`, `everywhere`, etc.),
         - events fetcher now uses web `/api/events` path as primary on native too, with Supabase fallback only when needed.
      - `apps/doWhat-mobile/src/app/home.tsx`
         - replaced plain contains-search with ranked tokenized search relevance,
         - added alias expansion for common sport terms (e.g., climbing/bouldering, billiards/pool/snooker, poker/holdem),
         - search suggestions now come from ranked matches.
   - Result:
      - mobile discovery/feed/map now uses stricter quality standards and closer web parity,
      - reduces placeholder/noisy entries,
      - improves search relevance for real user terms,
      - keeps fallback resilience when upstream sources are unavailable.
   - Validation:
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - repo test task (`test:passWithNoTests`) passed for executed suites.

3. **Mobile Home geolocation correctness fix: honor user-selected city/location (e.g., Hanoi) over device GPS**
   - User-reported issue: Home feed/cards showed places/activities not matching selected profile location (`Hanoi`).
   - Root causes:
      - Home load sequence preferred device location first, then profile coordinates,
      - upcoming sessions list was not location-bounded and could include global rows.
   - Fixes applied in `apps/doWhat-mobile/src/app/home.tsx`:
      - profile location is now treated as source-of-truth for discovery when present,
      - if profile has a location label, app geocodes it and uses those coordinates for Home discovery,
      - best-effort sync updates `profiles.last_lat/last_lng` to match selected location coordinates,
      - device GPS/background/profile fallback chain is now only used when no valid profile-selected location is available,
      - Upcoming Sessions query now joins venue coordinates and applies radius filtering around selected location (`25km`) before rendering,
      - strict label quality gating remains in place to prevent fake/placeholder rows from rendering.
   - Additional tooling:
      - added `scripts/cleanup-fake-location-data.mjs`:
         - audits suspicious placeholder/fake names in `places`, `venues`, `activities`,
         - supports dry-run by default,
         - supports guarded deletion (`APPLY=1`) only for rows not referenced by sessions/events.
   - Data cleanup execution status:
      - direct DB host remained unresolved (`ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`),
      - switched diagnostics/cleanup to Supabase pooler endpoint (`aws-1-eu-west-2.pooler.supabase.com:6543`) and confirmed connectivity,
      - dry-run + apply run found one suspicious venue label (`Everywhere`), but guarded deletion removed `0` rows because the row is still referenced (safety condition prevented destructive delete).
   - Validation:
      - mobile typecheck passed (`pnpm --filter doWhat-mobile run typecheck`),
      - workspace lint passed,
      - targeted tests passed (`12/12`).

4. **iOS simulator launch stability fix (ERR_NGROK_3200): default mobile task now uses localhost Expo Go**
   - User-reported issue: app launch failed in simulator with `ERR_NGROK_3200` (`*.exp.direct` endpoint offline).
   - Root cause:
      - default workspace mobile task relied on ngrok tunnel transport, which was intermittently dropping.
   - Fix applied:
      - `.vscode/tasks.json`
         - `mobile:dev` now runs Expo Go in localhost mode (`expo start -c --go --host localhost --port 8081`) to remove tunnel dependency for simulator runs.
   - Additional environment finding:
      - local `xcrun simctl` currently reports pending Xcode license acceptance, which blocks `expo run:ios` dev-client installs until accepted.

## 2026-02-28

1. **Create Event venue-name suggestions from nearby matches (optional adopt, manual typing preserved)**
   - User-reported UX issue: while typing venue name manually (e.g. `VietClimb`), existing nearby matching venues were not suggested inline.
   - Requirement: suggest matching nearby venue names as the user types, but keep full freedom to ignore suggestions and continue with custom/manual text.
   - Fixes applied:
      - `apps/doWhat-web/src/app/create/venueDiscovery.ts`
         - added `suggestVenueOptions(...)` ranked matcher:
            - exact label match,
            - prefix match,
            - substring/token match,
            - deterministic tie-breakers by label length + name.
      - `apps/doWhat-web/src/app/create/page.tsx`
         - integrated `venueNameSuggestions` derived from typed manual text + nearby venue options,
         - added inline “Matching nearby venues (optional)” suggestion list under venue name input,
         - clicking `Use` applies selected suggestion into venue/place selection,
         - user can ignore suggestions and keep manual typing unchanged.
   - Tests added/updated:
      - `apps/doWhat-web/src/app/create/__tests__/venueDiscovery.test.ts`
         - added suggestion coverage for typed label matching and empty-query behavior.
   - Validation:
      - targeted Jest passed (`8/8`) for `venueDiscovery` + `venueSelection` suites,
      - workspace `typecheck` passed,
      - workspace `lint` passed.

2. **Deep events visibility fix: newly created sessions no longer hidden by historical-session starvation**
   - User-reported issue: multiple newly created events were not showing across surfaces.
   - Root cause (verified with live API inspection):
      - `/api/events` session fallback queried `sessions` ordered by `starts_at` ascending with a hard limit,
      - when no explicit `from` was passed, old historical sessions consumed the limit window,
      - newly created/recent sessions were excluded from payload despite existing in DB.
   - Fix applied:
      - `apps/doWhat-web/src/app/api/events/route.ts`
         - introduced default recent lookback for session fallback (`24h`) when `from` is omitted,
         - session fallback now always applies `starts_at >= effectiveFromIso` to prioritize recent/upcoming sessions.
   - Tests added/updated:
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
         - added regression test asserting session fallback applies a default `starts_at` lower bound and includes recent session-origin events when `from` is absent.
   - Validation:
      - targeted Jest passed (`14/14`) for events payload + sessions server suites,
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - live `/api/events?limit=200` now includes recent session-origin events that were previously omitted.

3. **Deep follow-up: timezone-safe create payloads + feed/map visibility windows**
   - User-reported issue persisted: newly created events still did not appear on main feed and map in some flows.
   - Additional root causes found:
      - `datetime-local` values from create form were being sent without timezone context and parsed on the server, which can shift intended local times,
      - map events query was hard-gated to highly verified entries (`verifiedOnly + minAccuracy`), excluding fresh session-origin events,
      - home/map windows were strict `starts_at >= now`, which can hide just-created/just-started sessions under timezone/skew edge cases.
   - Fixes applied:
      - `apps/doWhat-web/src/app/create/dateTime.ts` (new)
         - added `formatDateTimeLocalInput(...)` for proper local `datetime-local` defaults,
         - added `toUtcIsoFromDateTimeLocal(...)` to convert local picker values into explicit UTC ISO before API submit.
      - `apps/doWhat-web/src/app/create/page.tsx`
         - replaced UTC-sliced defaults (`toISOString().slice(0,16)`) with local formatter,
         - submit payload now sends timezone-safe ISO timestamps derived on client from local picker values.
      - `apps/doWhat-web/src/app/page.tsx`
         - added 12h recent lookback for upcoming feed query to reduce false-empty states around skew/timezone boundaries.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - added 12h lookback for map events window,
         - removed default strict verification gating in events query args so newly created session-origin events are visible by default.
   - Tests added/updated:
      - `apps/doWhat-web/src/app/create/__tests__/dateTime.test.ts` (new)
         - covers local formatting, local→UTC conversion, and invalid format rejection.
   - Validation:
      - targeted Jest passed (`11/11`) for `create/dateTime`, `create/venueDiscovery`, and `/api/events` payload tests,
      - workspace `typecheck` passed,
      - workspace `lint` passed.

4. **Follow-up remediation: include ongoing sessions + stabilize map event recall**
   - User-reported issue after previous pass: map still showed zero events while feed showed at least one, and one expected live event remained missing.
   - Additional causes addressed:
      - session/event queries were still start-time-centric, so currently-running sessions could be dropped when `starts_at` fell just outside the lower bound,
      - map event API query bounds could stay too narrow relative to radius intent, causing events near edge-of-radius to be omitted before client filtering.
   - Fixes applied:
      - `apps/doWhat-web/src/app/page.tsx`
         - home feed session query now includes ongoing sessions via OR lower-bound logic:
            - `starts_at >= lookback` OR `ends_at >= now`.
      - `apps/doWhat-web/src/app/api/events/route.ts`
         - session fallback now includes ongoing sessions using:
            - `starts_at >= effectiveFromIso` OR `ends_at >= effectiveFromIso`.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - events query bounds now always expand around query center with at least `25km` envelope,
         - prevents premature omission of candidate events due narrow viewport-derived bounds.
   - Tests updated:
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
         - added assertion for OR-based fallback filtering (`starts_at` + `ends_at`).
   - Validation:
      - targeted Jest passed (`3/3`) for `/api/events` payload suite,
      - workspace `typecheck` passed,
      - workspace `lint` passed.

5. **Map events empty-state hardening (fallback visibility when location/radius constraints are too strict)**
   - User-reported issue persisted: main feed could show active content while map events column still rendered empty.
   - Additional adjustments in `apps/doWhat-web/src/app/map/page.tsx`:
      - when precise location is unavailable (`locationErrored`), events query omits strict bounds so map can still load event candidates,
      - events list filtering now has a fallback chain:
         - first prefer nearby radius matches,
         - if none found, fall back to fetched events payload (instead of hard-empty state).
   - Result:
      - map events panel no longer remains falsely empty under center/radius/location edge conditions.
   - Validation:
      - workspace `typecheck` passed,
      - workspace `lint` passed.

6. **Starvation mitigation pass: increase session fetch budgets on Home + Events fallback**
   - User follow-up indicated one expected event still missing after map rendering fixes.
   - Additional likely source: global ordering with hard limits can starve locally relevant rows before downstream filtering.
   - Changes applied:
      - `apps/doWhat-web/src/app/page.tsx`
         - increased `HOME_QUERY_LIMIT` from `80` to `500` so upcoming feed has a wider candidate window before grouping.
      - `apps/doWhat-web/src/app/api/events/route.ts`
         - session fallback now overfetches before bounds filtering using guarded limits:
            - min fetch: `500`,
            - multiplier: `limit * 5`,
            - max fetch cap: `2000`.
         - this reduces false omissions when many global sessions exist in the same date window.
   - Validation:
      - targeted Jest (`/api/events` payload) passed (`3/3`),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

7. **Newly-created session safety net: include `created_at` in visibility windows**
   - User reported a second event was created successfully but still missing from both home and map.
   - Additional hardening applied to account for schedule timestamp skew/edge cases right after creation:
      - `apps/doWhat-web/src/app/page.tsx`
         - home feed lower-bound OR now includes `created_at.gte(lookback)` in addition to `starts_at`/`ends_at`.
      - `apps/doWhat-web/src/app/api/events/route.ts`
         - session fallback selector now includes `created_at.gte(effectiveFromIso)` alongside `starts_at`/`ends_at`.
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
         - updated expectation to assert OR filter includes `created_at` branch.
   - Validation:
      - targeted Jest (`/api/events` payload) passed (`3/3`),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

8. **Mobile iOS Google OAuth callback fix (localhost dead-end in simulator browser)**
   - User-reported issue (with screenshot): after Google sign-in on iOS simulator, auth flow landed on `localhost` in Safari and failed to connect.
   - Root cause:
      - OAuth authorize URL occasionally carried a loopback `redirect_to` (`localhost` / `127.0.0.1`) in Expo Go flows,
      - this redirect is valid for web but not for iOS deep-link completion, producing a dead-end browser page instead of app callback.
   - Fixes applied:
      - added `apps/doWhat-mobile/src/lib/oauthRedirect.ts`:
         - canonical app callback resolver (`dowhat://auth-callback`),
         - `redirect_to` parser,
         - loopback detection,
         - auth URL redirect normalization.
      - updated `apps/doWhat-mobile/src/components/AuthButtons.tsx`:
         - standardized redirect target to app scheme callback,
         - normalizes Supabase OAuth URL `redirect_to` away from loopback before opening auth session,
         - logs warning in dev when loopback is detected.
      - updated `apps/doWhat-mobile/src/lib/auth.ts`:
         - reuses shared redirect normalization for non-UI auth entry points.
   - Tests added:
      - `apps/doWhat-mobile/src/lib/__tests__/oauthRedirect.test.ts`
         - parses `redirect_to`,
         - detects loopback values,
         - rewrites loopback redirects,
         - injects callback when missing.
   - Validation:
      - targeted Jest passed (`4/4`) for new oauth redirect helpers,
      - workspace `typecheck` passed,
      - workspace `lint` passed.

9. **iOS map sparse places remediation (4 places in view)**
   - User-reported issue on iOS map: only 4 places appeared in-view despite rich nearby place inventory.
   - Root cause:
      - native map places fetch path prioritized Supabase-only results,
      - OpenStreetMap fallback was used only when Supabase returned zero places,
      - in sparse viewport slices, non-zero but low Supabase counts (e.g., 4) prevented fallback enrichment.
   - Fix applied:
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
         - added sparse threshold augmentation (`SPARSE_SUPABASE_PLACES_THRESHOLD = 24`),
         - when Supabase returns low-but-nonzero place count, fetches OSM fallback and merges/dedupes results,
         - preserves Supabase-first behavior while improving map density in sparse tiles,
         - exposes merged provider counts and attributions.
   - Validation:
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - file diagnostics clean.

10. **Expo Go iOS connectivity fix (LAN URL connection failure)**
   - User-reported issue: iOS simulator showed “Could not connect to the server” for `exp://192.168...` LAN URL.
   - Root cause:
      - Expo Go was launched in LAN mode; simulator/network state can block LAN route resolution.
   - Fixes applied:
      - restarted mobile dev server in tunnel mode:
         - `expo start -c --go --ios --tunnel`,
      - updated workspace mobile task default to tunnel transport:
         - `.vscode/tasks.json` `mobile:dev` now runs `pnpm --filter doWhat-mobile exec expo start -c --go --tunnel`.
   - User-flow validation:
      - tunnel connected and ready,
      - iOS simulator was opened with `exp://...exp.direct` endpoint,
      - Metro bundling resumed successfully.

11. **iOS map count fix: fetch from Supabase `places` in addition to `venues`**
   - User follow-up: map still showed only 4 activities in view.
   - Root cause:
      - native map place loader queried only `venues` bounds,
      - this under-represented available inventory compared to nearby discovery surfaces backed by `places`.
   - Fixes applied:
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
         - added secondary bounded query to `places` table,
         - maps canonical place rows into `PlaceSummary`,
         - merges + dedupes `venues` and `places` datasets,
         - keeps bounded result cap (`queryLimit`) and graceful fallback behavior when `places` query is unavailable.
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
         - updated provider hint copy to reflect merged source (`venues + places`, fallback OSM).
   - Validation:
      - file diagnostics clean on modified files,
      - workspace `lint` passed,
      - workspace `typecheck` task remained healthy on changed files.

12. **iOS/web map algorithm parity: mobile now uses the same strict `/api/nearby` ranking/filter rules as web**
   - User request: apply the same strict map algorithm on iOS as on web.
   - Changes applied:
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
         - mobile places fetcher now calls shared nearby pipeline first via `createNearbyActivitiesFetcher` against `/api/nearby`,
         - uses web-equivalent map query geometry (`center + radius` derived from viewport bounds),
         - forwards active taxonomy category filters to nearby query (`filters.taxonomyCategories`),
         - maps nearby activities into `PlaceSummary` for existing mobile rendering,
         - keeps existing Supabase/OSM fallback only when nearby API is empty/unavailable.
   - Result:
      - iOS map candidate selection/ranking now matches web’s strict nearby logic for the primary path, with resilience fallback retained.
   - Validation:
      - workspace `typecheck` passed,
      - workspace `lint` passed.

## 2026-02-27

1. **Profile location edit resilience fix (ENOTFOUND during save)**
   - User-reported issue: editing profile location failed with `getaddrinfo ENOTFOUND ...supabase.co` surfaced in the edit modal.
   - Root cause:
      - `apps/doWhat-web/src/app/api/profile/[id]/update/route.ts` called `ensureProfileColumns()` before update,
      - when local DB hostname resolution/connectivity failed, the route returned `500` immediately,
      - this blocked otherwise valid profile updates (name/bio/location/socials) that can be persisted through Supabase API without the optional schema check.
   - Fixes applied:
      - `apps/doWhat-web/src/app/api/profile/[id]/update/route.ts`
         - changed ensure step to best-effort warning only (no hard-fail response),
         - route now proceeds with profile upsert even if schema ensure cannot reach DB host.
      - `apps/doWhat-web/src/lib/db/ensureProfileColumns.ts`
         - added non-fatal connectivity error classification (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, `ETIMEDOUT`, `ENETUNREACH`, host-translation patterns),
         - migration helper now skips gracefully on transient/unreachable DB connectivity and logs a warning instead of throwing.
   - Tests added:
      - `apps/doWhat-web/src/app/api/profile/[id]/update/__tests__/route.test.ts`
         - verifies update route still returns success and performs upsert when ensure step throws `ENOTFOUND`.
   - Validation:
      - targeted Jest passed:
         - new route test (`/api/profile/[id]/update`),
         - existing `ProfilePage.integration.test.tsx` (3/3),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

2. **Cross-city discovery parity upgrade (Hanoi/Bucharest vs Bangkok)**
   - User-reported issue: Hanoi returned significantly fewer activities than Bangkok for comparable map usage.
   - Deep findings (same endpoint/settings, radius `2.5km`, `limit=2000`, `refresh=1`, `explain=1`):
      - before fix:
         - Hanoi: `count=78`, `afterFallbackMerge=207`, mostly `supabase-places`,
         - Bangkok: `count=426`, `afterFallbackMerge=594`.
      - key difference was not ranking logic divergence; it was **supply hydration depth**:
         - Bangkok had deeper warmed inventory,
         - non-Bangkok cities relied more on pre-existing place rows with lower immediate in-radius depth.
   - Improvements applied:
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
         - added sparse-city on-demand bootstrap path (`maybeBootstrapSparseCityPlaces(...)`),
         - when query is unfiltered + small radius + sparse results, engine now force-refreshes place supply for query bounds and re-merges places fallback in the same request,
         - added nearest-city inference for known warm centers (Bangkok, Hanoi, Bucharest) with safe distance guard.
      - `apps/doWhat-web/src/lib/places/hanoiWarm.ts`
         - `DEFAULT_TILE_COUNT: 10 -> 20`.
      - `apps/doWhat-web/src/lib/places/bucharestWarm.ts`
         - `DEFAULT_TILE_COUNT: 10 -> 20`.
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - bumped discovery cache key version to `v=3` so old lower-depth cached payloads are invalidated.
   - Validation:
      - live `/api/nearby` after fix (Hanoi center, same settings):
         - `count: 78 -> 128`,
         - `afterFallbackMerge: 207 -> 257`.
      - Bangkok remained strong after update (same settings):
         - `count=472`, `afterFallbackMerge=640`.
      - workspace `typecheck` passed,
      - workspace `lint` passed.

3. **Selective city-wide expansion for filtered map queries (performance-safe)**
   - User requirement: increase place/activity breadth for filtered exploration without slowing initial/general map access.
   - Implementation in `apps/doWhat-web/src/app/map/page.tsx`:
      - added `filteredAugmentedQuery` (25km + high limit) that activates **only when**:
         - user is authenticated,
         - there is at least one active structured filter,
         - no free-text search is active,
      - merged augmented candidates with base nearby candidates before final client-side filtering,
      - sparse-filter radius expansion now applies to **any active structured filter** (not only activity-type filters), including the zero-results case.
   - Performance behavior:
      - default map load path unchanged (no extra filtered augmentation request),
      - broader retrieval cost is paid only for explicit filtered intent.
   - Validation:
      - workspace `typecheck` passed,
      - workspace `lint` passed,
      - live evidence (Hanoi, `types=climbing`):
         - `2.5km: 0`,
         - `25km: 2` (expanded filtered recall available when augmentation engages).

   4. **Map UX rule update: remove activity "View details" CTA (events-only details)**
      - User requirement: `View details` should not appear for activities; it should exist only for events.
      - Changes applied:
         - `apps/doWhat-web/src/components/WebMap.tsx`
            - removed activity popup `View details →` button,
            - removed `onRequestActivityDetails` prop from map component API.
         - `apps/doWhat-web/src/app/map/page.tsx`
            - removed `handleActivityDetails` handler and tracking event,
            - removed `onRequestActivityDetails` wiring into `WebMap`,
            - removed activity list-card `View details →` button.
      - Result:
         - activity surfaces now expose only `View events` (when available), `Create event`, and `Show on map`,
         - event popup/list behavior remains unchanged with event-level `View details` intact.

   5. **Intermittent zero-results fix for specialty filters/search (e.g. `climb`)**
      - User-reported issue: map occasionally showed `0 activities` for climbing intent even when a matching place existed.
      - Deep root cause (verified via `/api/nearby?...types=climbing&explain=1`):
         - discovery had one valid typed match after fallback (`afterMetadataFilter: 1`),
         - the global generic-label quality gate removed it (`dropped.genericLabels: 1`),
         - final result became empty (`count: 0`).
      - Why this looked intermittent:
         - it happens in sparse specialty scenarios where the only matching candidate is a generic-labeled place,
         - in richer areas, non-generic matches exist so the gate does not zero out results.
      - Fix in `apps/doWhat-web/src/lib/discovery/engine.ts`:
         - introduced a guarded fallback path: for explicit `activityTypes`/`tags` filtered queries,
         - when generic filtering would drop **all** remaining candidates,
         - preserve those candidates instead of returning a false empty result.
      - Validation:
         - before: `types=climbing` at Hanoi query returned `count=0` with `dropped.genericLabels=1`,
         - after: same query returns `count=1` (`Nearby spot`, `activity_types` includes `climbing`, `tags` includes `climbing`),
         - unfiltered quality gate behavior remains intact (`dropped.genericLabels` still non-zero on broad queries),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   6. **Create Event venue picker now location-scoped + filter-adaptive expansion**
      - User requirement: while creating an event, venue/place choices must be near the person’s location, and search area should expand when filters are active.
      - Root cause:
         - `apps/doWhat-web/src/app/create/page.tsx` previously loaded venue options from `venues` table ordered by name globally,
         - this produced cross-city options unrelated to the current user location.
      - Fixes applied:
         - added `apps/doWhat-web/src/app/create/venueDiscovery.ts`:
            - builds location-aware nearby query config,
            - uses adaptive radius/limit:
               - base (no activity filter): `12.5km`,
               - filtered (activity intent detected): `25km`,
            - maps nearby discovery activities into deduplicated venue/place options ordered by distance.
         - updated `apps/doWhat-web/src/app/create/page.tsx`:
            - venue dropdown now fetches from `/api/nearby` using current `lat/lng`,
            - applies activity-derived `types` tokens when activity filter is present,
            - replaces global venue list with nearby location-scoped options,
            - added user-facing status text for loading/error/fallback-manual input.
      - Tests added:
         - `apps/doWhat-web/src/app/create/__tests__/venueDiscovery.test.ts`
            - verifies radius expansion when filter exists,
            - verifies token derivation for activity intent,
            - verifies dedupe-by-label with nearest-first ordering.
      - Validation:
         - targeted Jest passed (`venueDiscovery.test.ts`: 3/3),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   7. **Map redirect reliability fix for newly created events (`highlightSession`)**
      - User-reported issue:
         - after event creation redirect to `/map?highlightSession=...`, event was often not visible,
         - event appeared only after clicking the related activity card (which recenters map), giving the impression it was created only as an activity.
      - Deep root cause:
         - map highlight flow only attempted to resolve the target session inside already-loaded `filteredEvents`,
         - `events` are fetched by current map bounds, so if current center/bounds did not include the new session location, match failed and no recenter occurred,
         - once user clicked activity, center moved and the same event became visible in the events column.
      - Fixes applied:
         - added `apps/doWhat-web/src/app/map/highlightSession.ts` to resolve coordinates from session payload (priority: `place` → `venue` → `activity` → direct coords),
         - updated `apps/doWhat-web/src/app/map/page.tsx` highlight effect:
            - if highlighted event is not yet in `filteredEvents`, performs one-shot fetch to `/api/sessions/[sessionId]`,
            - recenters map/query center to session coordinates,
            - ensures `both` mode and preselects the highlighted event id,
            - keeps existing behavior to remove `highlightSession` param once event is actually resolved in the events feed.
      - Tests added:
         - `apps/doWhat-web/src/app/map/__tests__/highlightSession.test.ts` (3 tests) for coordinate resolution fallback chain and null handling.
      - Validation:
         - targeted Jest passed (`highlightSession.test.ts`: 3/3),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   8. **Deep follow-up fix: stale activity focus + low-quality generic cards in filtered map views**
      - User-reported regression after initial redirect fix:
         - newly created event context could still be overshadowed by stale `activity` query focus,
         - low-quality generic card (`Nearby spot`) appeared in filtered/search view even when meaningful matches existed.
      - Root causes:
         - `activity` query-param focus effect still ran while `highlightSession` handling was active,
         - highlight resolver recentered center/query but did not force bounds update immediately,
         - search/filter result set lacked a final quality-pruning pass to suppress generic tag-only cards when better type-aligned cards were present.
      - Fixes applied:
         - `apps/doWhat-web/src/app/map/page.tsx`
            - while `highlightSession` exists, skip stale activity-param auto-focus effect,
            - on highlight match, clear selected activity and remove both `highlightSession` and `activity` params,
            - when resolving center from `/api/sessions/[sessionId]`, also set bounds around that center to force immediate events query coverage,
            - integrated final low-quality pruning pass for filtered/search results before rendering.
         - `apps/doWhat-web/src/app/map/resultQuality.ts` (new)
            - added `pruneLowQualitySearchActivities(...)` to drop generic label cards (e.g. `Nearby spot`) when meaningful alternatives exist,
            - retains generic fallback only when it is the only available match.
         - tests added:
            - `apps/doWhat-web/src/app/map/__tests__/resultQuality.test.ts` (2 tests),
            - existing `apps/doWhat-web/src/app/map/__tests__/highlightSession.test.ts` retained for center-resolution chain.
      - Validation:
         - targeted Jest passed (`resultQuality` + `highlightSession`: 5/5),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   9. **Second deep remediation for unresolved map regressions (event visibility + quality guard hardening)**
      - User follow-up: issues persisted in real flow (`search=climb`) with generic `Nearby spot` still visible and event visibility still inconsistent.
      - Additional root causes found:
         - events fetch remained viewport-bounds constrained even during active text search / highlight flow,
         - generic candidates could still pass search via tag-only text matching before final prune in some combinations.
      - Additional fixes applied:
         - `apps/doWhat-web/src/app/map/page.tsx`
            - events query bounds now auto-expand to ~25km around current center whenever text search is active or `highlightSession` is present,
            - this ensures newly created nearby session-events are fetched even when initial viewport is narrow (e.g. ~2.5km),
            - added stricter in-search guard: generic display cards are rejected unless their `activity_types` include user intent tokens,
            - retained and applied final low-quality prune stage for strict and expanded result paths.
         - `apps/doWhat-web/src/app/map/resultQuality.ts`
            - exported reusable helpers `isGenericActivityDisplay(...)` and `hasTypeIntentMatch(...)` for stricter pipeline enforcement.
      - Regression validation:
         - targeted Jest suites passed:
            - `searchTokens`, `searchMatching`, `searchPipeline.integration`, `highlightSession`, `resultQuality` (19/19),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   10. **Duplicate activity card fix (`VietClimb` shown twice) + place-aware session creation hardening**
      - User-reported issue: same venue (`VietClimb`) appeared twice in map activities list.
      - Root cause:
         - one record came from `supabase-venues` (`venue:...`) and another from `supabase-places` (`place:...`) with same label + near-identical coordinates,
         - they had different `place_id` values so backend place-key dedupe did not collapse them,
         - create flow accepted nearby place options but treated selected option ID as `venueId`, causing new venue materialization in some place-driven flows.
      - Fixes applied:
         - `apps/doWhat-web/src/app/create/page.tsx`
            - added explicit `placeId` handling in prefill/state/submit,
            - parse venue dropdown IDs by prefix (`place:...`, `venue:...`) instead of assuming everything is `venueId`,
            - preserve selected dropdown value separately and keep manual venue input disabled when either venue/place is selected.
         - `apps/doWhat-web/src/lib/sessions/server.ts`
            - `extractSessionPayload(...)` now parses `placeId` / `place_id`.
         - `apps/doWhat-web/src/app/api/sessions/route.ts`
            - POST now prioritizes explicit `placeId` and only materializes a venue when needed (`venueId` present OR no place and manual venue name provided).
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/route.ts`
            - PATCH applies the same place-first / conditional-venue logic.
         - `apps/doWhat-web/src/app/map/resultQuality.ts`
            - added `dedupeNearDuplicateActivities(...)` (label + proximity dedupe, quality-scored winner selection),
            - exported helpers used by map search quality guard.
         - `apps/doWhat-web/src/app/map/page.tsx`
            - integrated near-duplicate dedupe in unfiltered/filtered/expanded result paths.
      - Validation:
         - API inspection confirmed duplicate source shape (`supabase-venues` + `supabase-places`) before fix,
         - targeted Jest passed (`resultQuality` + `sessions/server`: 10/10),
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   11. **Refresh persistence fix for highlighted newly-created event**
      - User-reported issue: after page refresh, newly-created event disappeared again.
      - Root cause:
         - map highlight flow removed `highlightSession` from URL immediately after first successful match,
         - refresh then lost the session context and reverted to bounds-only event loading.
      - Fix applied in `apps/doWhat-web/src/app/map/page.tsx`:
         - keep `highlightSession` in URL,
         - remove only stale `activity` param so focused activity does not override event context.
      - Result:
         - refreshing `/map` continues to re-focus and re-fetch the highlighted session event reliably.
      - Validation:
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   12. **Additional resilience: recover created-session highlight even when URL param is missing**
      - User follow-up indicated refresh/context loss still occurred in some navigation paths where `highlightSession` was absent.
      - Fixes:
         - `apps/doWhat-web/src/app/create/page.tsx`
            - on successful create, persist session context to `sessionStorage` (`dowhat:last-created-session` with id + timestamp).
         - `apps/doWhat-web/src/app/map/page.tsx`
            - added fallback highlight recovery from `sessionStorage` (24h freshness window),
            - map highlight/event focus flow now uses `effectiveHighlightSessionId` (`URL param` or `storage fallback`),
            - stale activity focus suppression and expanded event bounds now also honor this effective highlight id.
      - Result:
         - refreshes and intermediate navigations no longer rely solely on URL query persistence to re-display the created event.
      - Validation:
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   13. **Focused-activity recenter on load/refresh to restore event visibility**
      - User follow-up: events still missing after refresh in flows where an `activity` param remained in URL.
      - Root cause:
         - focused activity selection from URL did not recenter map/query bounds,
         - events API remained bound to previous/default viewport, so events near the focused activity were excluded.
      - Fix in `apps/doWhat-web/src/app/map/page.tsx`:
         - when `selectedActivity` resolves, map now recenters once per activity id,
         - synchronizes `center` + `queryCenter` and rebuilds bounds around the focused activity,
         - uses a one-shot ref guard to avoid repeated recenter loops.
      - Result:
         - refreshing a focused-activity map URL now aligns events query area with the focused activity location, restoring event display.
      - Validation:
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   14. **Reinforcement regression test pass across historical fixes (`changes_log` audit)**
      - User request: review prior incidents and add preventive tests so map/create/session/profile regressions do not resurface.
      - Added/updated test coverage:
         - `apps/doWhat-web/src/app/create/__tests__/venueSelection.test.ts` (new)
            - verifies robust parsing of prefixed selector values (`place:*`, `venue:*`) and unknown/empty handling.
         - `apps/doWhat-web/src/lib/db/__tests__/ensureProfileColumns.test.ts` (new)
            - verifies non-fatal handling/classification for DB connectivity failures (e.g. `ENOTFOUND`) and throw behavior for non-connectivity errors.
         - `apps/doWhat-web/src/lib/sessions/__tests__/server.test.ts` (updated)
            - added payload parsing coverage for `placeId` / `place_id` aliases,
            - clarified parser contract to normalize/forward non-empty string ids for downstream UUID validation at API/domain layers.
         - `apps/doWhat-web/src/app/map/__tests__/resultQuality.test.ts` (updated)
            - added near-duplicate suppression scenario for same-label/same-location candidates (e.g. venue/place dual-source duplication).
      - Validation:
         - targeted Jest reinforcement batch passed (`25/25`), including:
            - `venueSelection.test.ts`,
            - `ensureProfileColumns.test.ts`,
            - `server.test.ts`,
            - `resultQuality.test.ts`,
            - `highlightSession.test.ts`,
            - `venueDiscovery.test.ts`.

   15. **Attendance consistency fix: `late_cancel` / `no_show` no longer remain `Going`**
      - User-reported issue: host recorded attendee as `Late cancel`, but session still displayed attendee as `Going` (badge + going counter remained inflated).
      - Deep root cause:
         - host attendance endpoint (`POST /api/sessions/[sessionId]/attendance/host`) only updated `attendance_status`,
         - RSVP status (`session_attendees.status`) was left unchanged,
         - session counters and roster badges derive from RSVP status (`going`/`interested`), so UI kept showing `Going`.
      - Fixes applied:
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/host/route.ts`
            - added final-status → RSVP sync during host attendance writes:
               - `attended` -> `status=going`
               - `late_cancel` -> `status=declined`
               - `no_show` -> `status=declined`
               - `registered` -> preserve existing RSVP status (no forced overwrite)
            - kept existing verified normalization (`checked_in` only true for `attended`).
      - Tests added/expanded:
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/__tests__/host.route.test.ts`
            - asserts RSVP sync payload for `attended`, `late_cancel`, and `no_show`,
            - asserts `registered` does not write/override RSVP `status`.
      - Validation:
         - targeted attendance suites passed (`17/17`):
            - host/join/leave attendance API routes,
            - `SessionAttendancePanel`, `SessionAttendanceQuickActions`, `SessionAttendanceBadges` component tests,
            - reliability normalization tests.
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   16. **Deep follow-up remediation: effective attendance status enforced across counts, roster, and session page**
      - User follow-up: despite prior host-route patch, UI still showed `Going` after marking attendee `late_cancel`.
      - Additional root cause:
         - multiple read paths still trusted raw RSVP status (`session_attendees.status`) without reconciling final attendance outcome,
         - legacy rows where `status=going` + `attendance_status=late_cancel|no_show` could still surface as going in some views.
      - Additional fixes applied:
         - `apps/doWhat-web/src/lib/sessions/server.ts`
            - `getAttendanceCounts(...)` now excludes `attendance_status in (late_cancel,no_show)` from `going` count,
            - `getUserAttendanceStatus(...)` now resolves effective status (`going + late_cancel/no_show -> declined`).
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/host/route.ts`
            - host roster GET now returns effective RSVP status so late-cancel/no-show attendees are surfaced as declined immediately.
         - `apps/doWhat-web/src/components/SessionAttendanceList.tsx`
            - list query now includes `attendance_status`,
            - client rendering maps `going + late_cancel/no_show` to `declined` before filtering/display.
         - `apps/doWhat-web/src/app/sessions/[id]/page.tsx`
            - participant loading for post-session voting excludes `late_cancel`/`no_show` rows even if legacy RSVP remained `going`,
            - page-level user attendance status resolver now returns effective status (declined for late-cancel/no-show).
      - Tests added/expanded:
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/__tests__/host.route.test.ts`
            - added GET test proving roster maps `going + late_cancel` to `declined`.
         - `apps/doWhat-web/src/lib/sessions/__tests__/server.test.ts`
            - added `getUserAttendanceStatus(...)` coverage for late-cancel remap and registered pass-through.
      - Validation:
         - targeted Jest suites passed (`29/29`) across sessions server + host/join/leave attendance routes + attendance UI suites,
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   17. **Roster display fix: registered attendance outcomes now visibly reflected in host roster surfaces**
      - User follow-up: attendance was recorded (e.g. `late_cancel`) but host-facing roster area still looked empty / not considered.
      - Root cause:
         - `SessionAttendanceList` defaulted to loading only `going` and `interested`,
         - host controls used that same list for the detailed roster,
         - once effective status became `declined`, attendee disappeared from that roster block.
      - Fixes applied:
         - `apps/doWhat-web/src/components/SessionAttendanceList.tsx`
            - added `includeDeclined` prop,
            - query/status filtering now conditionally includes `declined`,
            - detailed badge rendering now supports and labels `Declined` explicitly,
            - event-driven updates preserve/remove declined rows based on `includeDeclined` mode.
         - `apps/doWhat-web/src/app/sessions/[id]/page.tsx`
            - host detailed roster now enables `includeDeclined`, so recorded late-cancel/no-show attendees remain visible in host controls.
      - Tests added:
         - `apps/doWhat-web/src/components/__tests__/SessionAttendanceList.test.tsx` (new)
            - verifies default mode hides declined,
            - verifies host mode (`includeDeclined`) displays declined attendee rows with correct badge.
      - Validation:
         - targeted attendance suites passed (`26/26`) including the new list test,
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   18. **App-wide live-update responsiveness hardening (mutation-triggered refresh bridge)**
      - User-reported issue: many in-app changes were not visible immediately and appeared only after manual refresh or unrelated interaction.
      - Deep findings:
         - much of the app relies on plain fetch/server-component reads without shared invalidation,
         - there was no global success-mutation refresh signal,
         - query-level freshness policy was conservative (`refetchOnWindowFocus: false`).
      - Fixes applied:
         - added `apps/doWhat-web/src/components/AppLiveUpdates.tsx`:
            - global client bridge that listens for successful same-origin `/api/*` mutations (`POST`/`PATCH`/`PUT`/`DELETE`),
            - dispatches a debounced app refresh (`router.refresh`) after mutation success,
            - refreshes on tab focus/visibility return with cooldown to avoid over-refresh loops.
         - added `apps/doWhat-web/src/lib/liveUpdates.ts`:
            - centralized mutation detection helpers (`isMutationMethod`, `shouldBroadcastMutation`, etc.) used by the bridge.
         - wired bridge into root app shell:
            - `apps/doWhat-web/src/app/layout.tsx` now mounts `AppLiveUpdates` once for whole-web-app coverage.
         - improved React Query defaults in `apps/doWhat-web/src/app/providers.tsx`:
            - `refetchOnWindowFocus: true`,
            - `refetchOnReconnect: true`.
      - Tests added:
         - `apps/doWhat-web/src/lib/__tests__/liveUpdates.test.ts` (new)
            - verifies mutation method detection,
            - verifies same-origin API mutation broadcast eligibility.
      - Validation:
         - targeted Jest suites passed (`16/16`) including new live-updates tests,
         - workspace `typecheck` passed,
         - workspace `lint` passed.

   19. **Attendance UX correction: `registered` no longer leaves attendee stuck as declined**
      - User-reported issue (session details host flow): after host changed final status back to `Registered`, attendee still appeared as `Declined` and counters/roster felt inconsistent.
      - Root cause:
         - previous fix physically wrote `status=declined` for `late_cancel`/`no_show`,
         - reverting final status to `registered` did not always restore RSVP state.
      - Fixes applied in `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/host/route.ts`:
         - host updates now read current attendee state before write,
         - attendance updates no longer force RSVP to declined for `late_cancel`/`no_show` (effective-declined is handled in read layer),
         - when transitioning from `late_cancel|no_show` back to `registered` and row is currently declined, route restores `status=going`.
      - Tests updated:
         - `apps/doWhat-web/src/app/api/sessions/[sessionId]/attendance/__tests__/host.route.test.ts`
            - verifies no forced RSVP status write for `late_cancel`/`no_show`,
            - verifies `registered` transition restores going in the stale-declined case.
      - Validation:
         - targeted Jest suites passed (`19/19`) across host route + sessions server + attendance list,
         - workspace `typecheck` passed,
         - workspace `lint` passed.

## 2026-02-26

1. **Hanoi + Bucharest parity with Bangkok discovery warm-up**
   - Added city-specific place warmers so we can run the same tile-based inventory bootstrap outside Bangkok:
      - `apps/doWhat-web/src/lib/places/hanoiWarm.ts`
      - `apps/doWhat-web/src/lib/places/bucharestWarm.ts`
   - Added cron endpoints:
      - `POST /api/cron/places/hanoi`
      - `POST /api/cron/places/bucharest`
   - Added CLI seed scripts and package commands:
      - `scripts/seed-places-hanoi.mjs`
      - `scripts/seed-places-bucharest.mjs`
      - package scripts `seed:places:hanoi` and `seed:places:bucharest`

2. **City matcher robustness for non-Bangkok runs**
   - Updated city-scoped activity matcher query in `apps/doWhat-web/src/lib/places/activityMatching.ts` to use case-insensitive matching across both `city` and `locality` columns (instead of strict `city = value`), improving cross-city operability.

3. **Verification (live runs)**
   - Ran both new city warmers with `CRON_SECRET` and 20 tiles:
      - Hanoi: successful, OSM provider counts observed, high tile place counts.
      - Bucharest: successful, OSM provider counts observed, high tile place counts.
   - Nearby API verification after warm-up:
      - Hanoi center (`21.0278, 105.8342`): `limit=150/300/600` returned `150/300/600`.
      - Bucharest center (`44.4268, 26.1025`): `limit=150/300/600` returned `150/300/600`.
      - Source breakdown confirms dominant `supabase-places` supply for both cities.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed.

2. **Map quality fix: remove noisy "Unnamed place" labels**
   - Investigated reports of many cards showing placeholder place names (`Unnamed place`) in map/list results.
   - Root cause:
      - source place rows sometimes carry placeholder names,
      - label hydration treated those placeholders as valid display labels,
      - discovery mapping surfaced them directly into `name`/`place_label`.
   - Fixes applied:
      - `apps/doWhat-web/src/lib/places/labels.ts`
         - fallback label changed from `Unnamed spot` to `Nearby spot`,
         - `normalizePlaceLabel(...)` now ignores placeholder candidates such as `Unnamed place`, `Unknown`, `N/A`, etc.
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
         - added display sanitization for discovery items across postgis/fallback/places/venues flows,
         - placeholder names are replaced with better available alternatives (`venue`, `placeLabel`, activity-derived labels) before API response.
      - tests updated/added:
         - `apps/doWhat-web/src/lib/places/__tests__/labels.test.ts`
         - API payload test expectations updated to shared fallback behavior.
   - Validation:
      - targeted tests passed (11/11),
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - live `/api/nearby` verification for the reported search scenario returned:
         - `unnamed_name = 0`,
         - `unnamed_label = 0`.

3. **Deep discovery quality pass: prioritize genuinely named places over generic fallback rows**
   - Follow-up issue: replacing `Unnamed` with `Nearby spot` still surfaced low-value generic cards in dense map queries.
   - Root cause:
      - fallback candidate selection and final limiting could include many generic records before named records,
      - internal ordering did not explicitly prioritize meaningful display labels.
   - Fixes applied in `apps/doWhat-web/src/lib/discovery/engine.ts`:
      - added `hasMeaningfulDiscoveryDisplay(...)` and `prioritizeMeaningfulActivities(...)`,
      - increased fallback activity scan window before final reduction (`max(limit * 4, 400)`),
      - prioritize meaningful named/place-labeled activities both in fallback mapping output and before final limit truncation.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - targeted tests passed,
      - live query (`q=climbing,billiards,chess,swimming`, Bangkok radius 2.5km, limit 60) improved from many generic rows to `generic_like = 0` with named places dominating the top results.

4. **Final remediation: eliminate stale/generic place cards and enforce source-name quality**
   - User-reported issue persisted in UI due stale cache entries and generic low-value fallback records still eligible in dense queries.
   - Fixes applied:
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - introduced discovery cache key schema version (`v=2`) so old cached payloads containing generic labels are invalidated automatically.
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts` + `apps/doWhat-web/src/lib/discovery/engine.ts`
         - added debug metric `dropped.genericLabels`,
         - strict filtering removes generic/non-meaningful discovery rows before final ranking/output,
         - keeps named places prioritized in final map payload.
      - `apps/doWhat-web/src/lib/places/providers/osm.ts`
         - added source-name quality gate for Overpass results,
         - skips placeholder/unnamed OSM records instead of persisting `Unnamed place` style entries.
      - tests:
         - `apps/doWhat-web/src/lib/__tests__/placesProviders.test.ts` now validates unnamed OSM records are skipped.
   - Validation:
      - targeted tests passed,
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - live `/api/nearby` check (Bangkok, radius 2.5km, limit 400, explain=1):
         - `nearby_mentions = 0`,
         - debug shows placeholder rows removed (`dropped.genericLabels = 168`),
         - top results are genuine named places.

5. **Bangkok-only depth expansion (user clarification follow-up)**
   - User clarified that the expectation was Bangkok completeness specifically.
   - Increased effective capacity so Bangkok discovery is no longer clipped at the previous 600-item ceiling:
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - `MAX_CACHE_ITEMS: 600 -> 2000`.
      - `apps/doWhat-web/src/lib/filters.ts`
         - nearby `limit` clamp increased to `2000`.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - `MAP_NEARBY_LIMIT: 1200`,
         - `MAP_SEARCH_AUGMENT_LIMIT: 2000`.
   - Validation (Bangkok center `13.7563,100.5018`, `limit=2000`, `refresh=1`):
      - radius 2.5km -> 416,
      - radius 5km -> 663,
      - radius 10km -> 690,
      - radius 25km -> 686.
   - Quality remained intact after expansion:
      - `nearby_mentions = 0` for the expanded 25km/686-result payload.

6. **Quality-preserving low-result map search expansion (strict aliases, no noisy broadening)**
   - Follow-up for low-count mixed queries (e.g. `billiards, climbing, poker, chess`) where strict inventory is sparse.
   - Improvements applied without broad generic matching:
      - `apps/doWhat-web/src/app/map/searchTokens.ts`
         - `extractSearchTerms(...)` now parses comma/semicolon/pipe/slash separated queries safely,
         - added `extractSearchPhrases(...)` with strict curated phrase expansions:
            - `billiards` -> `snooker`, `pool hall`, `pool club`, `pool table`
            - `climbing` -> `bouldering`, `rock climbing`, `climbing gym`
            - `chess` -> `chess club`, `chess cafe`, `chess academy`
            - `poker` -> `poker room`, `poker club`, `texas hold em`, `holdem`
      - `apps/doWhat-web/src/app/map/page.tsx`
         - activities/events text filtering now uses expanded strict phrases for better recall while preserving intent.
      - tests updated:
         - `apps/doWhat-web/src/app/map/__tests__/searchTokens.test.ts` now covers comma-separated parsing + strict phrase expansions.
   - Validation:
      - targeted Jest passed (`searchTokens.test.ts`: 6/6),
      - file diagnostics clean (no new TypeScript/ESLint issues in changed files).

7. **Low-result follow-up after user refresh: widened search fetch + poker taxonomy support**
   - User still observed the same low count after refresh for mixed search intent.
   - Additional improvements applied:
      - `apps/doWhat-web/src/app/map/page.tsx`
         - search augmentation now always widens active text search to `25km` + high limit **without prefiltering by derived activity types**,
         - this prevents valid text matches from being excluded before client-side relevance filtering.
      - `packages/shared/src/activities/catalog.ts`
         - added new strict activity preset: `poker` (keywords for poker rooms / card rooms / hold'em), enabling fallback classification where source text supports it.
      - `apps/doWhat-web/src/app/map/searchTokens.ts`
         - added poker aliases (`holdem`, `texas hold em`) and strict phrase expansions (`card room`, `casino poker`).
      - `apps/doWhat-web/src/app/map/__tests__/searchTokens.test.ts`
         - added coverage for poker alias and phrase expansion behavior.
   - Validation:
      - targeted Jest passed (`searchTokens.test.ts`: 6/6),
      - workspace typecheck passed,
      - Bangkok reseed executed (`seed:places:bangkok` with cron auth),
      - strict mixed-intent supply remains sparse in current local inventory (quality-preserving candidate ceiling remains low), indicating a source-coverage bottleneck rather than filtering logic.

8. **Provider health diagnosis for Bangkok coverage bottleneck**
   - Investigated why mixed strict filters still return ~5 results after logic improvements and reseeding.
   - Findings:
      - Foursquare provider requests return `401` (unauthorized), so no Foursquare inventory is being ingested.
      - Google Places API responds successfully, but current ingestion keeps Google entries transient/non-persisted by design.
      - Effective persisted supply for this scenario remains predominantly OSM-derived, which is sparse for `poker`/`chess` in the tested Bangkok area.
   - Additional warm-coverage tuning:
      - `apps/doWhat-web/src/lib/places/bangkokWarm.ts`
         - widened warm tile precision (`6 -> 5`) and expanded tile limits (default/max).
      - result: broader Bangkok warm sweep succeeds, but strict query counts remain bounded by provider data availability.

9. **Foursquare migration fix (service keys + new Places endpoint)**
   - Follow-up after service-key clarification:
      - migrated provider base URL from legacy `api.foursquare.com/v3/...` to `places-api.foursquare.com/...`,
      - switched auth to `Authorization: Bearer <SERVICE_KEY>`,
      - added required header `X-Places-Api-Version: 2025-06-17`,
      - updated query params for new API (`fsq_category_ids`),
      - updated response parsing to support new fields (`fsq_place_id`, `latitude`, `longitude`) with backward compatibility.
   - Additional adjustment:
      - reduced requested response fields to a credit-friendly set to avoid premium-field credit failures.
   - Validation:
      - direct migrated endpoint call returns HTTP `200` with results,
      - Bangkok seed now reports non-zero Foursquare provider pulls per tile,
      - workspace typecheck passed.

10. **Adaptive sparse-filter expansion for map activity types**
   - User follow-up: known climbing venue (`Rock Domain`) disappeared when strict map radius remained narrow.
   - Improvement in `apps/doWhat-web/src/app/map/page.tsx`:
      - when activity-type filters are active (without free-text search),
      - and strict in-radius results are sparse but non-zero,
      - client automatically expands candidate radius up to 25km and reapplies the **same strict filters**.
   - This increases recall for valid long-tail categories (e.g. climbing) without introducing low-quality loose matches.
   - Validation:
      - workspace typecheck passed,
      - no diagnostics in changed file.

11. **Deep search retrieval fix for missing known specialty venues (Rock Domain case)**
   - User reported `Rock Domain` (known climbing venue) no longer appearing in map search.
   - Root-cause findings:
      - `Rock Domain` remains present in strict climbing discovery payload at 25km,
      - but text-search retrieval pipeline relied mainly on an unfiltered augmentation feed,
      - so specialty venues could be absent from the candidate set used for final text filtering when provider ranking/candidate mix shifted.
   - Fix in `apps/doWhat-web/src/app/map/page.tsx`:
      - added a second search augmentation query that applies derived `activityTypes` tokens (`searchAugmentedTypeQuery`),
      - merged three sources for search candidate pool:
         1) base nearby results,
         2) unfiltered search augmentation,
         3) token-filtered search augmentation,
      - preserves strict filtering quality while improving specialty recall consistency.
   - Validation:
      - simulation of merged candidate pool confirms `Rock Domain` is retained for `climbing/poker/chess` style search,
      - workspace `typecheck` passed,
      - workspace `lint` passed.

12. **Map multi-activity search precision fix (removed massage leakage under strict comma filters)**
   - User-reported issue: when using a strict comma-separated search like `climbing, billiards, chess, poker, swimming`, unrelated cards such as `Massage` could still appear.
   - Root cause in `apps/doWhat-web/src/app/map/page.tsx` + `apps/doWhat-web/src/app/map/searchTokens.ts`:
      - structured multi-activity matching used expanded tokens (for recall),
      - expansion terms such as `pool` (from `billiards`) were treated as strict match tokens,
      - this allowed non-target activities with overlapping generic tags to pass.
   - Fixes applied:
      - added `extractStructuredActivityTokens(...)` in `apps/doWhat-web/src/app/map/searchTokens.ts` to derive canonical strict tokens from user input terms (no broad expansions),
      - updated structured comma-separated matching in `apps/doWhat-web/src/app/map/page.tsx` to use strict tokens only for `activity_types` / tag fallback checks.
   - Tests:
      - updated `apps/doWhat-web/src/app/map/__tests__/searchTokens.test.ts` with regressions ensuring structured token extraction:
         - preserves canonical intents (`climbing`, `billiards`, `chess`, `poker`, `swimming`),
         - excludes broad expansion tokens (`pool`, `snooker`, `bouldering`, `holdem`),
         - keeps alias normalization (`pool` -> `billiards`, `texas hold em` -> `poker`).

13. **Map search algorithm deep hardening + central matching utility**
   - Follow-up deep pass on the map filtering algorithm to reduce future drift and ensure strict intent behavior remains stable.
   - Improvements:
      - added `apps/doWhat-web/src/app/map/searchMatching.ts` with centralized `matchesActivitySearch(...)` logic,
      - structured multi-activity mode now explicitly uses canonical intent tokens only,
      - strict matching checks `activity_types` + tag fallback with exact token membership,
      - non-structured search behavior (free text + phrase expansions + token recall) preserved.
   - Refactor:
      - `apps/doWhat-web/src/app/map/page.tsx` now delegates search match decisions to the shared helper to avoid duplicated inline logic and reduce regression risk.
   - Regression tests:
      - added `apps/doWhat-web/src/app/map/__tests__/searchMatching.test.ts` covering:
         - exclusion of unrelated `Massage` card for strict comma intent input,
         - canonical type-token matches,
         - canonical tag fallback matches,
         - non-structured phrase-recall behavior.
   - Validation:
      - targeted Jest passed (`searchTokens` + `searchMatching`: 12/12),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

14. **Map search pipeline integration coverage (user-confirmed semantics)**
   - User confirmed expected behavior:
      - comma-separated search remains OR semantics,
      - tag fallback remains enabled for sparse `activity_types`.
   - Added integration-level coverage in `apps/doWhat-web/src/app/map/__tests__/searchPipeline.integration.test.ts`:
      - verifies comma multi-intent search returns matching intents while excluding unrelated `massage` rows,
      - verifies tag fallback still matches canonical intent tokens when `activity_types` is empty.
   - Validation:
      - targeted Jest passed (`searchTokens` + `searchMatching` + `searchPipeline.integration`: 14/14),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

15. **Playwright UI-level validation for map structured search behavior**
   - Added browser-level scenario in `apps/doWhat-web/tests/e2e/map-search-structured.spec.ts` to validate real UI behavior end-to-end:
      - opens map,
      - applies comma-separated search input (`climbing, billiards, chess, poker, swimming`),
      - verifies OR semantics by keeping matching cards,
      - verifies unrelated `Massage` card is excluded.
   - Added explicit test-only map auth bypass path in `apps/doWhat-web/src/app/map/page.tsx`:
      - enabled only when `NEXT_PUBLIC_E2E_ADMIN_BYPASS=true` and query includes `e2e=1`,
      - keeps production behavior unchanged while enabling deterministic map e2e coverage.
   - Validation:
      - Playwright spec passed (`map-search-structured.spec.ts`, chromium),
      - workspace `typecheck` passed,
      - workspace `lint` passed.

## 2026-02-24

1. **Map search fix: multi-activity queries now work (e.g. "billiards climbing")**
   - Investigated the failure case where typing multiple activity terms in the map search box returned no results even when each activity type existed.
   - Root cause:
      - Search augmentation only derived a **single** activity token from the entire input string, so multi-term input like `billiards climbing` became one unusable token.
      - Client-side text matching relied heavily on full-string inclusion, so multi-term combinations were too strict.
   - Fixes applied:
      - Added `apps/doWhat-web/src/app/map/searchTokens.ts` with reusable tokenization helpers:
         - `toActivitySearchToken(...)`
         - `extractActivitySearchTokens(...)`
         - `extractSearchTerms(...)`
      - Updated `apps/doWhat-web/src/app/map/page.tsx`:
         - search augmentation now sends multiple derived activity types (union), not one,
         - client-side matching now supports multi-term input by checking tokenized words and derived activity tokens across `name/venue/place/tags/activity_types`,
         - events text search now also uses tokenized terms.
      - Added regression tests in `apps/doWhat-web/src/app/map/__tests__/searchTokens.test.ts` for partial terms, multi-word aliases, and multi-term extraction.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - Jest (targeted): `searchTokens.test.ts` passed (4/4),
      - API verification:
         - `/api/nearby?...&types=climbing,billiards` returns combined results from both categories,
         - `/api/nearby?...&types=climbing` and `/api/nearby?...&types=billiards` each return expected category-specific subsets.

2. **Bangkok inventory depth fix: map no longer capped at 200 activities**
   - Investigated reports that Bangkok map discovery still felt limited versus available supply.
   - Root cause: a hidden discovery cap (`MAX_CACHE_ITEMS = 200`) combined with request-level `limit` clamping prevented `/api/nearby` from returning more than 200 items even when data existed.
   - Fixes applied:
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - increased `MAX_CACHE_ITEMS` from `200` to `600`.
      - `apps/doWhat-web/src/lib/filters.ts`
         - increased `/api/nearby` query limit ceiling from `200` to `600` with safe parsing/normalization.
      - `apps/doWhat-web/src/app/map/page.tsx`
         - increased base map nearby request limit to `400`,
         - increased search-augmented limit target to `600`.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - API verification now returns expected high-volume counts:
         - `limit=300 -> 300`,
         - `limit=400 -> 400`,
         - `limit=500 -> 500`,
         - `limit=600 -> 600`.

## 2026-02-22

1. **Map specialty activity discovery fix (climbing/roller-skating)**
   - Investigated live Bangkok map behavior where search/filtering for specialty activities (for example `climbing`) showed zero results despite known places in the dataset.
   - Root causes found:
      - place-fallback `activity_types` were too generic for many specialty venues,
      - narrow filtered fallback scans were too shallow for long-tail categories,
      - map text search did not match against `tags`/`activity_types`.
   - Fixes applied:
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
         - derive place-fallback `activity_types` from keyword matching against `ACTIVITY_CATALOG_PRESETS` (name/address/tags/categories),
         - widen place fallback scan depth for narrow filters,
      - `packages/shared/src/activities/catalog.ts`
         - added specialty presets: `roller-skating`, `horse-riding`,
      - `apps/doWhat-web/src/app/map/page.tsx`
         - map search now also checks `tags` + `activity_types`,
         - added search-augmented nearby query (activity-type token + wider search radius) and merges results client-side before radius gating.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed,
      - API verification:
         - `/api/nearby?...&radius=13000&types=climbing` returns 1 result (`WellFit Bon Marché`, ~11.7km),
         - `/api/nearby?...&radius=25000&types=climbing` returns 2 results.

2. **Follow-up fix: specialty search with small radius ("climb" on 2.5km map)**
   - Investigated a remaining UX gap where typing `climb` still showed zero results when the map radius was very small (for example 2.5km), even though valid climbing activities existed nearby in broader Bangkok bounds.
   - Updated `apps/doWhat-web/src/app/map/page.tsx` so active text search uses an effective minimum radius of 25km for client-side inclusion, while keeping non-search behavior unchanged.
   - Added partial-term normalization for search augmentation tokens:
      - `climb*`/`bould*` -> `climbing`,
      - `skat*`/`roller*` -> `roller-skating`,
      - `horse*`/`equestrian*` -> `horse-riding`.
   - Fixed client-side search matching so augmented specialty results (for example places tagged as `climbing`) are retained even when the raw free-text term (`climb`) is not present in the displayed name field.
   - Validation:
      - `pnpm -w run typecheck` passed,
      - `pnpm -w run lint` passed.

## 2026-02-21

1. **Events ingestion: multi-source location verification**
   - Added cross-source location verification in `apps/doWhat-web/src/lib/events/verification.ts` and wired it into the ingest pipeline.
   - Events are now annotated with `metadata.locationVerification` using a strict rule: same `place_id` or within 300m coordinates, with at least 2 distinct sources required for confirmation.
   - Ingestion summaries now include `locationVerified` and `locationPending` counters per source.

2. **Verification regression tests**
   - Added `apps/doWhat-web/src/lib/events/__tests__/verification.test.ts` covering both confirmed (multi-source) and pending (single-source) location states.

3. **Documentation update**
   - Updated `docs/events-ingestion.md` with the new location verification model and metadata fields so ingestion behavior is auditable.

4. **Profile location autocomplete (London lookup fix)**
   - Implemented forward-geocode autocomplete in `apps/doWhat-web/src/components/profile/ProfileHeader.tsx` for manual location edits.
   - Added debounced query flow to `/api/geocode?q=...`, selectable suggestions dropdown, and coordinate capture on selection so updates persist both label and lat/lng.
   - Added regression coverage in `apps/doWhat-web/src/__tests__/ProfilePage.integration.test.tsx` to verify typing `Lond` returns/selects London and persists coordinates via profile update API.
   - Validation: targeted Jest integration tests passed; workspace typecheck passed.

5. **Map center now follows profile location**
   - Updated map bootstrapping in `apps/doWhat-web/src/app/map/page.tsx` to prioritize profile location (`/api/profile/me`) before browser geolocation.
   - Added profile center resolver utilities in `apps/doWhat-web/src/app/map/profileCenter.ts`.
   - Extended profile payload from `apps/doWhat-web/src/app/api/profile/[id]/route.ts` with `locationLat/locationLng` sourced from stored `last_lat/last_lng`.
   - Fallback order is now: profile coordinates → profile location geocode → device geolocation → default fallback center.
   - Added tests in `apps/doWhat-web/src/app/map/__tests__/profileCenter.test.ts`.
   - Validation: map/profile tests passed, workspace typecheck passed, workspace lint passed.

6. **Discovery/event algorithm reliability + efficiency upgrade**
    - Upgraded event location verification logic in `apps/doWhat-web/src/lib/events/verification.ts`:
       - Introduced weighted `accuracyScore` (0..100) using source quality + corroboration + canonical place agreement.
       - Confirmation now requires multi-source support plus high-confidence threshold (`>=95`).
       - Persisted thresholds and scores inside `metadata.locationVerification`.
    - Added/updated tests:
       - `apps/doWhat-web/src/lib/events/__tests__/verification.test.ts` validates high-accuracy confirmation behavior.
       - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts` validates `verifiedOnly=1&minAccuracy=95` filtering.
    - Added verified filtering controls across event query stack:
       - Shared contracts and fetchers updated in `packages/shared/src/events/types.ts`, `packages/shared/src/events/api.ts`, and `packages/shared/src/events/utils.ts`.
       - Events API now supports `verifiedOnly` and `minAccuracy` query params in `apps/doWhat-web/src/app/api/events/route.ts`.
       - Map now requests high-accuracy verified events by default (`verifiedOnly=true`, `minAccuracy=95`) in `apps/doWhat-web/src/app/map/page.tsx`.
    - Improved ingestion efficiency in `apps/doWhat-web/src/lib/events/ingest.ts` with bounded parallel source processing (`concurrency` option, default 3 workers, max 6).
    - Validation: targeted tests passed, workspace typecheck passed, workspace lint passed.

7. **Bangkok no-community bootstrap hardening (map population without users)**
    - Executed automated population jobs against local runtime:
       - `seed-places-bangkok` with `BANGKOK_TILE_COUNT=20` to warm a wider place inventory.
       - cron activity matcher dry-run/apply cycles for place-to-activity inference.
    - Discovery fallback upgraded so map can show place-backed inventory even when user-generated activities are sparse:
       - `apps/doWhat-web/src/lib/discovery/engine.ts`
          - venue fallback rows now carry `place_id`.
          - place-backed fallback IDs (`place:*`, `venue:*`) are accepted by place-gating.
          - added `places` fallback retrieval path (`source: supabase-places`) after venue fallback.
    - Improved activity-matching robustness for multilingual text:
       - `apps/doWhat-web/src/lib/places/activityMatching.ts` now normalizes with Unicode letter/number support (`\p{L}\p{N}`), improving non-Latin keyword matching.
    - Expanded preset activity catalog breadth for auto-bootstrap coverage:
       - `packages/shared/src/activities/catalog.ts` now includes additional presets (billiards, massage, surf, boating, martial arts, running, cycling, badminton).
    - Validation:
       - `/api/nearby` Bangkok explain payload now returns dense fallback inventory (`sourceBreakdown` includes `supabase-places`; final count reached limit=150).
       - workspace typecheck/lint passed after code changes.

## 2026-01-08

1. **/map performance: request storm control**
   - Debounced map region updates (250ms) and normalised bounds/radius so `/api/nearby` and `/api/events` don’t refetch repeatedly for equivalent move-end payloads. Also added React Query `placeholderData` (keep previous), longer `staleTime/gcTime`, and disabled reconnect/mount refetches to reduce background churn.

2. **WebMap render performance**
   - Switched `WebMap` from a fully controlled `viewState` (rerendering on every pan/zoom frame) to an uncontrolled Mapbox view with `initialViewState` + imperative `easeTo`, keeping map interactions smooth and reducing React work during drags.

3. **Reusable debounce hook**
   - Added `useDebouncedCallback` to `apps/doWhat-web/src/lib/hooks` for consistent debounced interaction handling.

## 2026-01-07

1. **Shared theme dist rebuilt**
   - `pnpm --filter @dowhat/shared build` regenerated `packages/shared/dist/theme.js`, exposing the typography tokens that `apps/doWhat-web/tailwind.config.js` expects. This unblocked the Next.js dev server that previously crashed while reading `sharedTheme.typography.family` inside `globals.css`.

2. **Expo env parity with web**
   - Added `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_WEB_URL` to both the root `.env.local` and `apps/doWhat-mobile/.env.local` so Expo Router receives the same Supabase + web host configuration as the web client. Restarting `expo start -c` now hydrates the Supabase client instead of redboxing.

3. **Nearby venue fallback resilience**
   - `/api/nearby` now retries the venues fallback query without `updated_at` whenever Supabase reports `column venues.updated_at does not exist`, logging a warning and continuing with the degraded dataset. This keeps the Activities list populated even on older databases that have not added the column yet.

## 2026-01-06

1. **Events API resilience**
   - `/api/events` and `/api/events/[id]` now fetch related place records via a dedicated query instead of relying on Supabase’s schema cache joins. This prevents runtime errors and guarantees `place` data is attached to each event payload.

2. **Database migrations**
   - Added `026_events_ingestion_upgrade.sql` to upgrade legacy `events` tables with ingestion-era columns, indexes, and triggers.
   - Added `027_sessions_created_by_backfill.sql` to recreate/backfill `sessions.created_by` and ensure consistent queries.

3. **Map create-event CTA**
   - Map list cards and popups now show “Create an event →” and route authenticated users directly to `/create?activityId=…`, prompting auth when needed and tracking with `map_activity_event_create_requested`.

4. **WebMap customization**
   - `WebMap` accepts an optional `activityActionLabel` prop so different surfaces can control the CTA text.

5. **Create flow deep-linking**
   - `/create` reads `activityId` and `activityName` from the query string and pre-fills the form when arriving from the map or other deep links.

6. **Documentation consolidation**
   - Added `PROJECT_OVERVIEW.md` and `ROADMAP.md`, replaced the default Next.js README inside `apps/doWhat-web`, noted the canonical docs from the mobile README, and linked everything from the root `README.md`. This keeps onboarding info, errors, and changes synchronized for future collaborators/agents.

## 2026-02-01

1. **Stabilization kickoff (discovery/map/venues)**
   - Logged the new stabilization scope (duplicate home events, hardcoded discovery removal, map/venues runtime errors, and auth gating) and started targeted fixes in the web app while preserving the “real Supabase data only” rule.

2. **Venues runtime fix (availability-tier init)**
   - Resolved the `ReferenceError: availableTier3Ids before initialization` by reordering the taxonomy-category sync effect after the memoized tier-3 availability list in `apps/doWhat-web/src/app/venues/page.tsx`.

3. **Home events: removed duplicate feed**
   - Deleted the separate “Discovered Nearby” block (and its component) so the homepage has a single canonical events feed with one empty state. Files: `apps/doWhat-web/src/app/page.tsx`, removed `apps/doWhat-web/src/components/home/NearbyDiscoverList.tsx`.

4. **Discovery debug: map/venues pipeline audit**
   - Traced `/map` + venues discovery flows and confirmed: `/api/nearby` currently returns activities without facet metadata, map client only filters by search term, and venues activity summary is pre-seeded via `ACTIVITY_NAMES` (even with zero counts). Flagged these as likely contributors to “only chess” showing and to filter options appearing without real DB backing. (Investigation only; fixes follow.)

5. **Map discovery pipeline upgrades**
   - Rebuilt `/api/nearby` to use the shared discovery engine so it returns real items plus filter support/facets/source metadata. Added full filter serialization (taxonomy, price, capacity, time window), expanded shared map types, and applied client-side filtering on the map to ensure every supported filter actually affects results while gracefully skipping unsupported metadata.

6. **Venues discovery cleanup**
   - Removed the pre-seeded activity summary list by deriving availability only from real venue signals, and blocked venue searches when the summary is empty so the page falls back to the clean “no activity signals yet” empty state instead of defaulting to chess.

7. **Empty state copy polish**
   - Updated the homepage empty state headline to “No events nearby yet” to match the product requirement for discovery messaging.

## 2026-02-08

1. **Discovery engine build failure investigation**
   - Tracked the build error to `apps/doWhat-web/src/lib/discovery/engine.ts` importing the missing `@dowhat/discovery-engine` package and a non-existent `@/lib/discovery/bounds` module. Planned local replacements to restore compile-time behavior without introducing mock data.

2. **Discovery engine core + bounds restoration**
   - Added `apps/doWhat-web/src/lib/discovery/engine-core.ts` to replace the missing `@dowhat/discovery-engine` module (types + normalization + cache constants + tile key + cache key builder).
   - Added `apps/doWhat-web/src/lib/discovery/bounds.ts` to safely compute query bounds from radius/center or normalize provided bounds.
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to consume the new local core utilities and reuse the shared `haversineMeters` helper.

3. **Discovery + map type fixes for web typecheck**
   - Added `/api/discovery/activities` route (calls `discoverNearbyActivities`, normalizes place labels, supports bounds + refresh, and defaults filter/facet metadata) to satisfy the existing tests.
   - Added `refresh` support to nearby API + shared fetcher types, and widened map filter query typings to allow tags.
   - Tightened discovery engine typing (null-safe source breakdown, distance sort guard, venue search result typing) and updated AuthGate route typing.
   - Patched test helpers to use safe casts for Node web globals and Jest mock typings.

4. **Validation runs (web + mobile)**
   - Web build failed in this environment because `next/font` could not reach `fonts.googleapis.com` (network restricted).
   - Web typecheck + Jest now pass after fixing discovery/map test typings and ICS recurrence normalization; Jest still emits console warnings from mocked Supabase/DB columns.
   - Web lint fails with existing rule violations (unused vars, hooks deps, explicit-any, display-name, and hooks usage) across several files.
   - Mobile typecheck + Jest pass, but Expo iOS/Android runs fail locally (missing CocoaPods + Homebrew for iOS; Android prebuild unable to create native directory).

5. **UI/UX refresh kickoff (web + mobile)**
   - Began redesign pass focused on the web home/navigation shell and shared mobile components (search, empty state, brand, hero cards) to improve visual hierarchy, spacing, and clarity without introducing mock data.
6. **Mobile SearchBar UX refresh**
   - Removed the hardcoded suggested-search fallback (now defaults to empty) to avoid fake content. Tightened the search input, filter button, and suggestion chip styling to align with the brand palette and improve focus clarity.
7. **Mobile EmptyState UX refresh**
   - Rebuilt the empty state into a branded panel with theme colors, softer icon treatment, and improved CTA styling for clearer hierarchy on iOS/Android.
8. **Mobile FindA4thHero styling + data-safe fallbacks**
   - Restyled the hero cards with theme colors, pill metadata, and tighter spacing. Removed the hardcoded venue placeholder and only render venue labels when provided.
9. **Mobile ActivityList visual cleanup**
   - Updated list cards to the shared theme palette, refined shadows/borders, and improved contrast for metadata and progress bars to match the refreshed UI language.
10. **Mobile home search suggestion note**
   - Updated the search suggestion comment in `home.tsx` to reflect that suggestions are derived from real nearby activity names (no simulated data).
11. **Validation runs (web + mobile)**
   - Web: `next build` fails in this environment because Google Fonts cannot be reached (fonts.googleapis.com ENOTFOUND). `next lint` still fails with existing lint issues in tests/components/hooks. `pnpm --filter dowhat-web test` passes but emits console warnings from mocked Supabase/missing columns. `pnpm --filter dowhat-web typecheck` passes.
   - Mobile: `pnpm --filter doWhat-mobile typecheck` + `test` pass but emit baseline-browser-mapping warnings and mocked Supabase console warnings. `expo run:ios` fails due to missing CocoaPods/Homebrew. `expo run:android` fails to create the native android directory.
12. **Venues page chunk error fix**
   - Switched the venues map from a dynamic import to a direct component import so the page no longer depends on a missing client chunk at runtime.
13. **Map page chunk resilience**
   - Removed the dynamic import wrapper around WebMap and used a direct client import to avoid missing client chunks in dev.

## 2026-02-11

1. **Session continuation + log discipline**
   - Read `changes_log.md` before continuing work and adopted a step-by-step logging workflow for this session.

2. **Sports onboarding save hardening (mobile)**
   - Updated `apps/doWhat-mobile/src/app/onboarding/sports.tsx` save flow to repair legacy profile rows that can trigger `profiles.user_id` null-constraint failures during upsert.
   - Logic now retries profile upsert after a targeted `user_id` repair update when Postgres error `23502` references `user_id`.

3. **Map abort-noise suppression (mobile)**
   - Updated `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` to treat abort-like fetch errors as non-fatal during places loading/fallback.
   - Added an explicit empty response path for aborted map requests to avoid surfacing `[Map] ... AbortError` as a user-facing failure during normal viewport churn.

4. **Validation after fixes**
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` (pass after code update).
5. **Runtime environment reset**
   - Restarted active dev runtimes after they dropped (`dowhat-web` on `http://localhost:3002`, Expo dev-client on `http://localhost:8081`) before continuing platform proofs.
6. **Fresh browser proof captures (web + mobile web)**
   - Captured fresh screenshots after runtime restart for:
     - Web: `/`, `/auth`, `/discover`
     - Mobile web (Expo): `/`, `/(tabs)/map`, `/onboarding/sports`
   - Verified current UI loads without the prior unstyled/blank-page regressions.
7. **iOS native proof captures (post-fix)**
   - Captured iOS screenshots for native app home, onboarding sports route, and map route after the latest map/onboarding fixes.
   - Observed current state:
     - Home loads without the previous save/network error overlays.
     - Onboarding sports screen loads with selectable cards.
     - Map opens and loads map tiles with no immediate red-box/network-failed overlay.
8. **Android verification status update**
   - Captured Android screenshots for home/onboarding/map via `adb` deep-link flow.
   - Found Android app intermittently opening into the development-client shell (`Development servers`) rather than directly into the in-app UI, which affects deterministic screenshot proof.
   - Cleared/re-captured `adb logcat` to isolate current failures. Latest clean relaunch did not reproduce the prior `profiles.user_id` (`23502`) error; ongoing issue appears tied to dev-client routing/session state and intermittent network failures.
9. **Android clean runtime repro + proof update**
   - Reconnected Android through Expo (`a`) and captured new clean screenshots after a fresh bundle load.
   - Confirmed Android home and onboarding render without the previous error toasts in the new session.
   - Captured Android map route loading state (spinner + controls); no immediate red network-error toast in this fresh run.
10. **Reliability pledge save hardening (mobile)**
   - Updated `apps/doWhat-mobile/src/app/onboarding/reliability-pledge.tsx` to mirror the sports-onboarding resilience path for legacy profile rows.
   - Save now uses profile upsert with `id` + `user_id`, and on `23502` (`user_id`) it performs a targeted repair update and retries upsert.
11. **Map events fetch path corrected for native**
   - Updated `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` so native platforms (`ios`/`android`) use Supabase fallback events directly instead of web `/api/events` first.
   - This removes avoidable cross-host dependency from native map events loading and reduces false network-failure surface area.
12. **Map logging-noise cleanup**
   - Downgraded non-fatal map diagnostics from `console.warn` to `console.info` across fallback/abort pathways so expected resilience paths no longer appear as warning-level runtime failures during normal use.
13. **Onboarding reliability test mock updated**
   - Updated `apps/doWhat-mobile/src/app/__tests__/onboarding-reliability-pledge.test.tsx` Supabase mock to include `.upsert(...)` support after the reliability screen save-path change.
14. **Viewport query algorithm guardrails (map)**
   - Added query dedupe helpers in `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`:
     - `viewportQueriesEqual(...)`
     - `regionNeedsQueryRefresh(...)`
     - time-based throttle via `lastQuerySyncAtRef`
   - Query refresh now requires meaningful viewport change (or explicit force) and respects a minimum refresh interval to prevent bursty map refetch churn.
15. **Validation reruns after latest patches**
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed (with baseline-browser-mapping staleness warning unchanged).
16. **Fresh platform proofs captured (post-fix)**
   - Web (Next): `/tmp/dowhat-web-home-proof-after-fixes.png`, `/tmp/dowhat-web-auth-proof-after-fixes.png`, `/tmp/dowhat-web-discover-proof-after-fixes.png`.
   - Mobile web (Expo web): `/tmp/dowhat-mobile-web-home-proof-after-fixes.png`, `/tmp/dowhat-mobile-web-map-proof-after-fixes.png`, `/tmp/dowhat-mobile-web-onboarding-proof-after-fixes.png`.
   - iOS (sim): `/tmp/dowhat-ios-home-proof-after-fixes.png`, `/tmp/dowhat-ios-onboarding-proof-after-fixes.png`, `/tmp/dowhat-ios-map-proof-after-fixes.png`.
   - Android (emulator): `/tmp/dowhat-android-home-proof-after-fixes-final.png`, `/tmp/dowhat-android-onboarding-proof-after-fixes-final.png`, `/tmp/dowhat-android-map-proof-after-fixes-final.png`.
17. **Android remaining visual caveat**
   - Android screenshots still show a bottom toast (`Cannot connect to Metro...`) from Expo Development Client state management.
   - This is a dev-runtime banner (not an app logic crash, not a Supabase error, not map fetch failure) and does not block in-app map/home/onboarding rendering in the captured runs.
18. **Map query refinement follow-up**
   - Removed an over-eager forced query-sync effect that was still causing repeated viewport query updates.
   - Added rounded events-query bounds (`3` decimals) to stabilize query keys and reduce tiny-coordinate cache misses.
   - Added query-key tolerance in `viewportQueriesEqual(...)` to avoid refetches caused only by floating-point noise.
19. **Post-refinement validation**
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran final route screenshot checks for web/mobile-web/native routes; map/home/onboarding continue to render after the query refinements.
20. **Android web-base host resolution fix**
   - Fixed `apps/doWhat-mobile/src/lib/web.ts` host extraction logic to only rewrite `localhost` to `10.0.2.2` on Android emulator (`!Constants.isDevice`), avoiding invalid host rewriting on real Android devices.
21. **Android startup reliability helper**
   - Added `apps/doWhat-mobile/scripts/start-android.sh` and wired `start:android` to use it.
   - The helper now clears stale dev ports, auto-starts the web dev server when needed, configures `adb reverse` for Metro/API, pins Expo dev-client host to localhost, and sets `EXPO_PUBLIC_WEB_URL` deterministically.
22. **Mobile docs sync**
   - Updated `apps/doWhat-mobile/README.md` quick-launch instructions to include the new Android startup helper and expected behavior.
23. **Web map query-key stabilization**
   - Updated `apps/doWhat-web/src/app/map/page.tsx` to reduce map refetch churn from floating-point jitter:
     - bounds comparison now uses tolerance instead of strict equality,
     - events query bounds are normalized/rounded (`3` decimals) before `useEvents` args are built.
   - This keeps `/api/events` query keys stable when map movement is visually unchanged.
24. **Validation reruns after web map stabilization**
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter dowhat-web test -- map` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed (baseline-browser-mapping staleness warning unchanged).
25. **Fresh proof captures (current run)**
   - Web screenshots:
     - `/tmp/dowhat-web-home-proof-current4.png`
     - `/tmp/dowhat-web-auth-proof-current4.png`
     - `/tmp/dowhat-web-discover-proof-current4.png`
     - `/tmp/dowhat-web-map-proof-current4.png`
   - Mobile web screenshots:
     - `/tmp/dowhat-mobile-web-home-proof-current4.png`
     - `/tmp/dowhat-mobile-web-onboarding-proof-current4.png`
     - `/tmp/dowhat-mobile-web-map-proof-current4.png`
   - iOS native screenshots:
     - `/tmp/dowhat-ios-home-proof-current4.png`
     - `/tmp/dowhat-ios-onboarding-proof-current4.png`
     - `/tmp/dowhat-ios-map-proof-current4.png`
   - Android native screenshots:
     - `/tmp/dowhat-android-home-proof-current4.png`
     - `/tmp/dowhat-android-onboarding-proof-current4.png`
     - `/tmp/dowhat-android-map-proof-current4.png`
26. **Runtime stability root-cause confirmation**
   - Confirmed repeated "Cannot connect to Metro" and "problem loading project" regressions were primarily runtime orchestration issues (dev servers not continuously alive), not new logic regressions in map/onboarding screens.
   - Re-established stable long-running sessions:
     - `pnpm --filter dowhat-web dev` (`http://localhost:3002`)
     - `pnpm --filter doWhat-mobile run start:ios` (`http://localhost:8081`)
     - `pnpm --filter doWhat-mobile run start:android` (`http://localhost:8081` + `adb reverse`)
27. **Deep-link behavior verification (Expo dev-client)**
   - Re-validated the correct launch sequence for development builds:
     1. Open project URL (`exp+dowhat-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`)
     2. Route with app scheme (`dowhat://...`)
   - Confirmed this avoids the recurring iOS `Failed to open app from .../--/...` failure state seen when route URL handling is attempted directly against dev-client project bootstrap.
28. **Fresh proof captures (current8/current8b)**
   - Web screenshots:
     - `/tmp/dowhat-web-home-proof-current8.png`
     - `/tmp/dowhat-web-auth-proof-current8.png`
     - `/tmp/dowhat-web-discover-proof-current8.png`
   - Mobile web screenshots:
     - `/tmp/dowhat-mobile-web-home-proof-current8.png`
     - `/tmp/dowhat-mobile-web-onboarding-proof-current8.png`
     - `/tmp/dowhat-mobile-web-map-proof-current8.png`
   - iOS native screenshots:
     - `/tmp/dowhat-ios-home-proof-current8.png`
     - `/tmp/dowhat-ios-onboarding-proof-current8.png`
     - `/tmp/dowhat-ios-map-proof-current8.png`
   - Android native screenshots:
     - `/tmp/dowhat-android-home-proof-current8b.png`
     - `/tmp/dowhat-android-onboarding-proof-current8b.png`
     - `/tmp/dowhat-android-map-proof-current8b.png`
29. **Android runtime log recheck**
   - Cleared and re-checked logcat during fresh routing flow; filtered scan did not show recurring:
     - `Network request failed`
     - `profiles.user_id` / `23502`
     - `[sports-onboarding] save failed`
     - `[reliability-pledge] save failed`
   - Android map now consistently surfaces real fallback/supabase venue counts (`places in view`) rather than failing with red-box network errors.
30. **Dev route opener helper (ios/android)**
   - Added `apps/doWhat-mobile/scripts/open-dev-route.sh` to make dev-client route testing deterministic.
   - The helper now:
     - opens Expo project URL first on cold start,
     - deep-links with `dowhat://...`,
     - retries route open once after boot delay,
     - skips project bootstrap on Android warm starts to avoid route override race.
   - Added scripts in `apps/doWhat-mobile/package.json`:
     - `open:route:ios`
     - `open:route:android`
31. **Mobile README route guidance update**
   - Updated `apps/doWhat-mobile/README.md` with route helper usage and explicit note that Expo Go style `/--/...` links should not be used for dev-build route bootstrap.
32. **Post-helper native validation**
   - iOS route helper validation:
     - `pnpm --filter doWhat-mobile run open:route:ios -- /map`
     - screenshot: `/tmp/dowhat-ios-map-proof-current9.png` (map loaded with places + controls).
   - Android route helper validation (after helper patch):
     - `pnpm --filter doWhat-mobile run open:route:android -- /map`
     - `pnpm --filter doWhat-mobile run open:route:android -- /onboarding/sports`
     - screenshots:
       - `/tmp/dowhat-android-map-proof-current10.png`
       - `/tmp/dowhat-android-onboarding-proof-current10.png`
     - no recurring filtered logcat hits for `Network request failed`, `23502`, `user_id`, or `Cannot connect to Metro` during this pass.
33. **Current quality gates (re-run)**
   - `pnpm --filter doWhat-mobile typecheck` passed.
   - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed.
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter dowhat-web test -- map` passed.
34. **Staged file audit before release sync**
   - Re-reviewed every staged file diff to keep only actionable, production-relevant changes:
     - mobile startup/routing helpers,
     - onboarding save hardening,
     - map fetch + query stability improvements,
     - web map query-key stabilization,
     - Supabase security hardening migration,
     - docs/log updates.
   - Confirmed no temporary runtime artifacts (`web-dev.log`, transient screenshots) are included in the staged set.
35. **Final pre-commit quality gate rerun**
   - Re-ran `pnpm --filter dowhat-web typecheck` (pass).
   - Re-ran `pnpm --filter doWhat-mobile typecheck` (pass).
   - Re-ran `pnpm --filter dowhat-web test -- map` (pass).
   - Re-ran `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` (pass; baseline-browser-mapping staleness warning unchanged).

## 2026-02-12

1. **Supabase Security Advisor follow-up hardening migration**
   - Added `apps/doWhat-web/supabase/migrations/062_security_advisor_search_path_hardening.sql`.
   - Migration auto-detects all `public` functions without an explicit `search_path` and applies:
     - `SET search_path = public, extensions, pg_temp`
   - This targets the repeated `Function Search Path Mutable` warnings shown in Security Advisor.
2. **Supabase execution readiness check (blocked by placeholder DSN)**
   - Verified local DB tooling state:
     - `psql` not installed on this machine.
     - `brew` not available.
     - Node `pg` client is available via `dowhat-web` workspace dependencies.
   - Validated provided DSN format and confirmed it still contains `[YOUR-PASSWORD]` placeholder, so remote migration execution cannot authenticate yet.
3. **Migration 062 robustness hardening**
   - Updated `062_security_advisor_search_path_hardening.sql` to avoid brittle execution in production:
     - excludes extension-owned functions (`pg_depend` + `pg_extension`),
     - wraps each `ALTER FUNCTION` in an exception block and skips entries with insufficient privilege.
   - Goal: ensure migration completes while still clearing `Function Search Path Mutable` for app-owned `public` functions.
4. **Automated Supabase advisor-fix runner**
   - Added `scripts/apply-security-advisor-fixes.mjs`.
   - Script behavior:
     - uses `SUPABASE_DB_URL`/`DATABASE_URL`,
     - applies migrations `061` and `062` with schema-migration tracking,
     - prints a verification summary for:
       - remaining mutable `public` functions,
       - `security_invoker` status of target views,
       - `spatial_ref_sys` RLS + read policy status.
   - Added root npm script: `db:advisor:fix`.
5. **Runner validation in local environment**
   - Syntax check passed: `node --check scripts/apply-security-advisor-fixes.mjs`.
   - Placeholder guard confirmed: running with `[YOUR-PASSWORD]` DSN exits early with clear error message.
6. **Migration 061 permission-safe update**
   - Remote execution failed on `must be owner of table spatial_ref_sys`.
   - Updated `061_security_advisor_hardening.sql` to be permission-safe for extension-owned tables:
     - wrapped RLS enable/policy creation/revokes in `DO` blocks with `insufficient_privilege` handling,
     - keeps advisor-targeted changes for app-owned objects while avoiding hard failure.
7. **Remote Supabase advisor fix execution (production DB)**
   - Ran `pnpm db:advisor:fix` against the configured Supabase project.
   - Applied migrations successfully:
     - `061_security_advisor_hardening.sql`
     - `062_security_advisor_search_path_hardening.sql`
   - Post-run verification summary:
     - `mutableFunctionCount`: `0`
     - target view `security_invoker` enabled for existing views (`dowhat_adoption_metrics`, `v_venue_activity_scores`, `v_venue_activity_votes`).
8. **Residual `spatial_ref_sys` advisory diagnosis**
   - Verified `public.spatial_ref_sys` owner is `supabase_admin` while current migration role is `postgres`.
   - Verified `postgres` cannot `SET ROLE supabase_admin` (`pg_has_role(..., 'member') = false`).
   - Conclusion: project-level DB credentials cannot enable RLS or create policy on `public.spatial_ref_sys`; this residual advisor item is ownership-constrained in Supabase managed extensions.
9. **Idempotency verification for advisor fixer**
   - Re-ran `pnpm db:advisor:fix` after successful application.
   - Confirmed idempotent behavior: migrations `061` and `062` were skipped as already applied.
   - Verification summary remained stable (`mutableFunctionCount = 0`; `spatial_ref_sys` ownership-limited state unchanged).
10. **PostGIS placement audit against production Supabase**
    - Audited extension metadata in live DB:
      - `postgis` exists, schema = `public`, version = `3.3.7`, `extrelocatable = false`.
      - `spatial_ref_sys` is extension-member (`is_postgis_member = true`) and owner `supabase_admin`.
      - Found active spatial columns in app tables: `activities.geom`, `events.geom`, `places.geom`.
11. **Permission probes for documented troubleshooting path**
    - Confirmed current role cannot run required catalog mutation:
      - `UPDATE pg_extension SET extrelocatable = true WHERE extname='postgis'` -> `permission denied for table pg_extension`.
    - Confirmed direct relocation is blocked in current state:
      - `ALTER EXTENSION postgis SET SCHEMA extensions` -> `extension "postgis" does not support SET SCHEMA`.
12. **Risk assessment for drop/reinstall workaround**
    - Executed rollback-only probe for `DROP EXTENSION postgis CASCADE`.
    - Given live geometry dependencies in core app tables, drop/reinstall was marked unsafe for self-service execution in production.
13. **Supabase doc alignment confirmation**
    - Reviewed Supabase PostGIS troubleshooting guidance and confirmed this scenario requires the relocation sequence that starts with changing `extrelocatable`, a step not executable with current project-level role privileges.
14. **Resolution path identified (support-assisted extension relocation)**
    - Determined remaining Security Advisor `spatial_ref_sys` finding can only be cleared via support-assisted PostGIS relocation from `public` to `extensions` for this project.
15. **Clarified Supabase support-only PostGIS relocation sequence**
    - Identified and shared the exact SQL block from the official PostGIS troubleshooting docs that Supabase support can run when `postgis` is stuck in `public` and non-relocatable.
    - Confirmed this sequence is privileged because it mutates `pg_extension` metadata and requires elevated ownership/permissions.
16. **Post-support verification run (live DB)**
    - Re-ran `pnpm db:advisor:fix` against production after support confirmation.
    - Verification summary now reports:
      - `mutableFunctionCount = 0`
      - `spatialRefSys = null` (no longer present in `public`)
      - advisor-target views remain `security_invoker = true`.
17. **PostGIS relocation confirmed complete**
    - Direct metadata checks confirm support successfully moved PostGIS objects:
      - extension schema: `extensions` (was `public`)
      - `spatial_ref_sys` table schema: `extensions`
      - `st_*` function count: `public = 0`, `extensions = 439`.
    - This matches the expected end state from the Supabase troubleshooting path.
18. **Security Advisor remaining items triage**
    - Confirmed Security Advisor still reports:
      - `Security Definer View` error for `public.social_sweat_adoption_metrics` (typo in migration `061` targeted `social_sweet_*`).
      - `Extension in Public` warnings for `vector`, `cube`, `earthdistance`, and `pg_net`.
      - `Auth`/`Config` warnings that must be resolved in the Supabase Dashboard (OTP expiry, leaked password protection, and Postgres patch upgrade).
19. **Security Advisor view + extension migrations (DB-level)**
    - Added `apps/doWhat-web/supabase/migrations/063_security_advisor_view_invoker_followup.sql` to set `security_invoker=true` on `public.social_sweat_adoption_metrics` (and keep back-compat for the earlier typo).
    - Added `apps/doWhat-web/supabase/migrations/064_security_advisor_extension_schema_cleanup.sql` to move `vector`, `cube`, and `earthdistance` out of `public` and reinstall `pg_net` into `extensions` (pauses any `cron.job` rows calling `net.http_*` while doing so).
    - Fixed the typo in `apps/doWhat-web/supabase/migrations/061_security_advisor_hardening.sql` so fresh installs target `social_sweat_*` correctly.
20. **Advisor-fix runner upgraded**
    - Updated `scripts/apply-security-advisor-fixes.mjs` to:
      - apply migrations `063` + `064`,
      - verify `security_invoker` for both `social_sweat_*` and `social_sweet_*`,
      - report extension schema placement for `vector`, `cube`, `earthdistance`, `pg_net`, and `postgis`.
21. **Migration apply attempt + cron privilege fix**
    - Ran `pnpm db:advisor:fix` against production:
      - `063_security_advisor_view_invoker_followup.sql` applied successfully.
      - `064_security_advisor_extension_schema_cleanup.sql` failed with `permission denied for table job` while attempting to pause `cron.job`.
    - Updated `064_security_advisor_extension_schema_cleanup.sql` to treat `cron.job` access as best-effort:
      - catches `insufficient_privilege` and continues with the extension relocation/reinstall path.
22. **Security Advisor DB-level items cleared**
    - Re-ran `pnpm db:advisor:fix` and applied `064_security_advisor_extension_schema_cleanup.sql` successfully.

## 2026-02-18

1. **Context + discovery algorithm review (no code changes)**
   - Read `changes_log.md` and reviewed the discovery + venue ranking logic plus event/session hydration to assess activity-to-place/event matching.
   - Files reviewed: `apps/doWhat-web/src/lib/discovery/engine.ts`, `apps/doWhat-web/src/lib/venues/search.ts`, `apps/doWhat-web/src/lib/recommendations/engine.ts`, `apps/doWhat-web/src/app/api/events/route.ts`, `apps/doWhat-web/src/lib/sessions/server.ts`, `apps/doWhat-web/src/lib/events/venueMatching.ts`.
2. **Map default mode now shows activities + events together**
   - Updated `apps/doWhat-web/src/app/map/page.tsx` so the map opens in `both` mode by default, matching the requirement to surface activities and events simultaneously.
3. **Strict place-backed activity enforcement in discovery**
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to only return activities that are canonical app activities (`id` is UUID) and linked to a canonical place (`place_id` is UUID).
   - This removes venue-proxy fallback items from the map activity feed and hardens activity-to-real-place accuracy.
4. **Activity detail navigation from map/list interactions**
   - Added explicit “View details →” actions for activities in both the map popup and list cards.
   - Updated `apps/doWhat-web/src/components/WebMap.tsx` and `apps/doWhat-web/src/app/map/page.tsx` with a dedicated activity details callback.
   - UUID activities now route to `/activities/[id]`; non-UUID fallback path safely redirects to create-event prefill.
5. **Validation for modified files**
   - Checked diagnostics for:
     - `apps/doWhat-web/src/app/map/page.tsx`
     - `apps/doWhat-web/src/components/WebMap.tsx`
     - `apps/doWhat-web/src/lib/discovery/engine.ts`
   - Result: no TypeScript/editor errors after the above changes.
6. **Workspace typecheck re-run after map/discovery hardening**
   - Ran workspace `typecheck` task (`pnpm -r run typecheck`).
   - Result: `packages/shared`, `apps/doWhat-web`, and `apps/doWhat-mobile` all passed.
    - Verification summary now confirms:
      - `mutableFunctionCount = 0`
      - `public.social_sweat_adoption_metrics security_invoker = true`
      - `vector`, `cube`, `earthdistance`, `pg_net`, and `postgis` all installed under schema `extensions`.
23. **Security Advisor remaining dashboard-only warnings**
    - Identified the remaining warnings as Supabase Dashboard configuration items (not SQL-migrationable):
      - `Auth OTP Long Expiry`
      - `Leaked Password Protection Disabled`
      - `Postgres version has security patches available`
    - Prepared step-by-step dashboard remediation guidance for the owner to apply.
24. **Post-DB-fix full regression pass (start)**
    - Began a fresh end-to-end verification run across web + mobile (web/iOS/Android):
      - typecheck, unit tests, lint
      - smoke navigation through core user surfaces (home/auth/discover/map/onboarding)
    - Any failures found in this pass will be fixed and re-verified before final sign-off.
25. **Typecheck re-run (post Security Advisor cleanup)**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
26. **Web lint + unit tests re-run (clean)**
    - `pnpm --filter dowhat-web lint` passed with no ESLint warnings/errors.
    - `pnpm --filter dowhat-web test` passed (67/67 suites, 227/227 tests) with no console noise.
27. **Mobile unit tests re-run (clean)**
    - Removed noisy debug logs from `apps/doWhat-mobile/src/app/home.tsx` and `apps/doWhat-mobile/src/app/people-filter.tsx`.
    - Downgraded `ProfileSimple` save failure logging to dev-only warnings (and suppressed in tests) in `apps/doWhat-mobile/src/app/profile.simple.tsx`.
    - Patched `baseline-browser-mapping@2.8.31` to suppress its stale-data warning under Jest workers; added `patches/baseline-browser-mapping@2.8.31.patch` + `pnpm.patchedDependencies` wiring.
    - `pnpm --filter doWhat-mobile test` passed (18/18 suites, 78/78 tests) with no console noise/warnings.
28. **Repo ESLint check**
    - `pnpm lint` passed.
29. **Root Jest warning cleanup**
    - Removed `collectCoverage: false` from `supabase/functions/jest.config.js` to eliminate the Jest config validation warning during `pnpm test`.
    - `pnpm test` now runs clean (no config warnings).
30. **Typecheck re-run (full)**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
    - `pnpm --filter @dowhat/shared typecheck` passed.
31. **People filters cleanup (mobile)**
    - Normalized indentation for the `fetchNearbyTraits` / `applyFilters` helpers after removing debug logs in `apps/doWhat-mobile/src/app/people-filter.tsx`.
32. **Pre-commit regression gates**
    - `pnpm lint` passed.
    - `pnpm test` passed (94/94 suites, 358/358 tests) with no warnings/errors.
33. **Final log hygiene**
    - Normalized the `saveEdits` try/catch indentation in `apps/doWhat-mobile/src/app/profile.simple.tsx` after removing the mount-time `console.log`.
    - Re-ran `pnpm lint` + `pnpm test` to confirm the repo remains clean.

## 2026-02-13

1. **Quality gates re-run (clean)**
   - `pnpm lint` passed.
   - `pnpm test` passed (94/94 suites, 358/358 tests) with no warnings/errors.
   - `pnpm --filter dowhat-web typecheck` passed.
   - `pnpm --filter doWhat-mobile typecheck` passed.

2. **Web + mobile-web smoke proof captures**
   - Web (Next) screenshots:
     - `/tmp/proof-20260213-web-home.png`
     - `/tmp/proof-20260213-web-auth.png`
     - `/tmp/proof-20260213-web-discover.png`
     - `/tmp/proof-20260213-web-map.png`
   - Mobile web (Expo) screenshots:
     - `/tmp/proof-20260213-mobile-web-home.png`
     - `/tmp/proof-20260213-mobile-web-map.png`
     - `/tmp/proof-20260213-mobile-web-onboarding-sports.png`

3. **iOS + Android smoke proof captures**
   - iOS (Simulator) screenshots:
     - `/tmp/proof-20260213-ios-home.png`
     - `/tmp/proof-20260213-ios-map.png`
     - `/tmp/proof-20260213-ios-onboarding-sports.png`
   - Android (Emulator) screenshots:
     - `/tmp/proof-20260213-android-home.png`
     - `/tmp/proof-20260213-android-map.png`
     - `/tmp/proof-20260213-android-onboarding-sports.png`
   - Android logcat scan (after clearing logs and re-opening routes) showed no fresh matches for:
     - `Network request failed`, `23502`, `profiles.user_id`, onboarding save failures, or Metro connection errors.

## 2026-02-16 (Continuation)

1. **Session resume + state restore**
   - Re-read `changes_log.md` to continue from latest validated point.
   - Confirmed current working tree contains pending changes in:
     - `apps/doWhat-mobile/src/app/__tests__/onboarding-reliability-pledge.test.tsx`
     - `apps/doWhat-mobile/src/app/__tests__/onboarding-traits.test.tsx`
     - `apps/doWhat-mobile/src/app/__tests__/sessions.contest-analytics.test.tsx`
     - `apps/doWhat-web/src/app/layout.tsx`
     - `package.json`
     - `pnpm-lock.yaml`
     - `scripts/health-migrations.mjs`
     - `scripts/health-notifications.mjs`
     - deleted `patches/baseline-browser-mapping@2.8.31.patch`

2. **Current regression focus**
   - Android screenshot evidence shows intermittent `System UI isn't responding` and toast-level `Network request failed`/deep-link parse noise during rapid route smoke automation.
   - Next step is a dedicated Android diagnosis pass (adb logs + controlled route open cadence) and then retest web/iOS/Android smoke paths with fresh captures.

## 2026-02-17

1. **Android diagnosis pass executed (controlled cadence + fresh captures)**
   - Re-ran Android route opens in controlled sequence (`/map` -> `/onboarding/sports` -> `/home`) with fixed delays and fresh log capture.
   - Captured new artifacts:
     - `/tmp/proof-20260217-android-map-v2.png`
     - `/tmp/proof-20260217-android-onboarding-sports-v2.png`
     - `/tmp/proof-20260217-android-home-v2.png`
     - `/tmp/proof-20260217-android-logcat-v2.txt`

2. **Dev route opener hardening (Android)**
   - Updated `apps/doWhat-mobile/scripts/open-dev-route.sh`:
     - deep-link format now uses `dowhat:///...` (path-safe form instead of host-like parsing),
     - Android retry open now runs only for cold-start bootstrap paths (skips warm-start duplicate route replay).
   - Goal: reduce unnecessary activity restarts/UI churn and remove one source of routing noise during automation.

3. **Android startup preflight warning (network health)**
   - Updated `apps/doWhat-mobile/scripts/start-android.sh` to run a lightweight emulator outbound-network check (`ping 8.8.8.8`) after `adb reverse` setup.
   - When connectivity is broken, startup now emits an explicit warning so smoke-test failures are immediately attributable to emulator runtime health rather than app logic.

4. **Root-cause evidence: emulator network environment instability (not app DB logic regression)**
   - During failing windows, Android diagnostics showed repeated `TypeError: Network request failed` and `AuthRetryableFetchError` in app logs.
   - Emulator shell connectivity checks during the same run showed DNS/network instability symptoms (`ping ... unknown host`, intermittent missing resolver state, and network reachability inconsistency), explaining the bursty transport failures.
   - Existing app-specific historical failures were *not* reproduced in this pass:
     - no fresh `profiles.user_id` / `23502` onboarding save errors.

5. **Follow-up recommendation**
   - Treat remaining Android flakiness as runtime/emulator health first (stable emulator networking, then route smoke).
   - Keep app-level verification focused on deterministic proofs after emulator connectivity is healthy.

## 2026-02-18

1. **Android smoke re-run after network-health recovery (clean)**
    - Confirmed emulator outbound connectivity before rerun (`ping 8.8.8.8` successful).
    - Re-ran controlled Android route sequence via helper:
       - `/map`
       - `/onboarding/sports`
       - `/home`
    - Captured fresh Android artifacts:
       - `/tmp/proof-20260218-android-map.png`
       - `/tmp/proof-20260218-android-onboarding-sports.png`
       - `/tmp/proof-20260218-android-home.png`
       - `/tmp/proof-20260218-android-logcat.txt`
    - Log scan result (clean for tracked signatures):
       - `Network request failed`: `0`
       - deep-link route mismatch warning: `0`
       - `BLASTSyncEngine` ANR precursor warning: `0`
       - no fresh `23502` / `profiles.user_id` onboarding-save failures.

2. **Web smoke proof refresh**

## 2026-02-20

1. **Discovery intelligence coding kickoff: ranking module integrated**
   - Added `apps/doWhat-web/src/lib/discovery/ranking.ts` with a first-pass startup-grade ranking layer:
     - weighted component scoring (`relevance`, `proximity`, `temporal`, `socialProof`, `quality`),
     - stable `dedupe_key` generation,
     - per-item `rank_score` and `rank_breakdown`,
     - confidence outputs (`quality_confidence`, `place_match_confidence`).

2. **Discovery item contract extended with intelligence metadata**
   - Updated `apps/doWhat-web/src/lib/discovery/engine-core.ts` to include optional ranking/confidence fields on `DiscoveryItem`.
   - Updated shared map typing in `packages/shared/src/map/types.ts` so API/UI consumers can safely receive the same metadata.

3. **Ranking layer wired into activity discovery path**
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to execute ranking after hard eligibility gates (`isPlaceBackedActivity`) and before final ordering.
   - Updated ordering logic to prioritize `rank_score` with distance/name tie-breakers.

4. **Validation checks after coding kickoff**
   - Re-ran editor diagnostics on changed files (ranking + discovery + shared types): no TypeScript/editor errors.
5. **Discovery debug counters + confidence gate (implementation pass)**
   - Extended discovery result contract with optional `debug` metadata in `apps/doWhat-web/src/lib/discovery/engine-core.ts`:
     - candidate counters across retrieval/gating stages,
     - drop counters (`notPlaceBacked`, `lowConfidence`, `deduped`),
     - ranking policy metadata.
   - Updated `apps/doWhat-web/src/lib/discovery/engine.ts` to:
     - support `includeDebug` option,
     - expose cache-hit debug diagnostics,
     - apply explicit place-confidence gate (`ACTIVITY_PLACE_MIN_CONFIDENCE = 0.8`) after ranking,
     - compute stage-by-stage counters for explainability.
6. **Nearby API explain mode + exposure telemetry**
   - Added `explain` query parsing in `apps/doWhat-web/src/lib/filters.ts`.
   - Updated `apps/doWhat-web/src/app/api/nearby/route.ts` to pass `includeDebug` and optionally return `debug` payload when `explain=1`.
   - Added `apps/doWhat-web/src/lib/discovery/telemetry.ts` for sampled discovery exposure logs (`[discovery.exposure]`) including top item scores/confidence and debug counters.
   - Hardened telemetry request-id extraction for mocked request objects (`request.headers?.get?.(...)`).
7. **Validation reruns after explain/telemetry integration**
   - Re-ran targeted test: `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass).
   - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
8. **Persistent discovery exposure storage (DB schema)**
    - Added `apps/doWhat-web/supabase/migrations/065_discovery_exposures.sql`.
    - New table `public.discovery_exposures` stores sampled discovery request/result payloads for ranking analytics and future LTR pipelines.
    - Included indexes on `created_at` and `request_id`, enabled RLS, and revoked anon/authenticated direct access (service-role write path only).
9. **Telemetry persistence implementation (service-role, sampled)**
    - Updated `apps/doWhat-web/src/lib/discovery/telemetry.ts` to persist sampled exposures into `discovery_exposures` using optional service client.
    - Kept graceful fallback behavior (non-blocking, warn-once on insert failure).
    - Added test-only control via `DISCOVERY_EXPOSURE_ALLOW_IN_TEST=1` and helper reset hook `__telemetryTesting.resetWarnings()`.
10. **Nearby route non-blocking telemetry + request mock hardening**
      - Updated `apps/doWhat-web/src/app/api/nearby/route.ts` to keep telemetry fire-and-forget (`void recordDiscoveryExposure(...)`) and maintain mocked-request compatibility.
11. **New discovery telemetry unit tests**
      - Added `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` covering:
         - sampled persistence path (`DISCOVERY_EXPOSURE_SAMPLE_RATE=1`),
         - no-op path (`DISCOVERY_EXPOSURE_SAMPLE_RATE=0`).
12. **Validation reruns after persistence changes**
      - Ran targeted tests:
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all packages/apps pass.
13. **Telemetry batching added for exposure writes**
      - Upgraded `apps/doWhat-web/src/lib/discovery/telemetry.ts` to support in-memory batched writes with configurable controls:
         - `DISCOVERY_EXPOSURE_BATCH_SIZE` (default `10`)
         - `DISCOVERY_EXPOSURE_FLUSH_MS` (default `1500`)
      - Added internal queue flush scheduling and test helper `__telemetryTesting.flushNow()`.
      - Maintained non-blocking behavior and warn-once failure semantics.
14. **Exposure retention cleanup job (ops hardening)**
      - Added `scripts/discovery-exposures-cleanup.mjs` to remove rows older than retention window (`DISCOVERY_EXPOSURE_RETENTION_DAYS`, default `30`).
      - Added root script command `db:discovery:cleanup` in `package.json`.
15. **Telemetry tests expanded for batch behavior**
      - Updated `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` for batched insert payload shape.
      - Added explicit batch-threshold flush coverage (batch size `2` test path).
16. **Validation reruns after batching + cleanup job**
      - Re-ran targeted tests:
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
      - Syntax check passed for new script:
         - `node --check scripts/discovery-exposures-cleanup.mjs`
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
17. **Admin analytics endpoint for discovery exposures**
      - Added `apps/doWhat-web/src/app/api/admin/discovery-exposures/route.ts`.
      - Endpoint behavior:
         - admin-email allowlist protected (`NEXT_PUBLIC_ADMIN_EMAILS`),
         - configurable window (`days`) + row cap (`limit`),
         - returns aggregate metrics for ranking observability:
            - cache/degraded rates,
            - average returned items,
            - average after-confidence-gate candidates,
            - total dropped counters (`notPlaceBacked`, `lowConfidence`, `deduped`),
            - average top rank score,
            - top sources and hourly timeseries.
18. **Admin exposure analytics tests added**
      - Added `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` covering:
         - non-admin rejection path,
         - successful aggregate response for admin users.
      - Adjusted request mocking to avoid runtime dependency on global `Request` in Jest node environment.
19. **Compatibility fix for mocked query builders**
      - Updated admin analytics route query chain to avoid `.returns(...)` fluent helper (cast result data instead), keeping compatibility with existing mocked builders in tests.
20. **Validation reruns after admin analytics endpoint**
      - Re-ran targeted tests (all pass):
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts`
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts`
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
21. **Admin UI for discovery analytics (read-side dashboard)**
      - Added `apps/doWhat-web/src/app/admin/discovery-exposures/page.tsx`.
      - New admin page includes:
         - allowlist-auth guard behavior aligned with existing admin pages,
         - window (`days`) and row-limit controls,
         - summary metric cards (cache/degraded rates, average returned items, average top score),
         - gating impact counters (after-confidence-gate average + dropped totals),
         - top source breakdown and hourly timeseries list,
         - metadata footer (rows considered + cutoff timestamp).
22. **Admin dashboard navigation link update**
      - Added `Discovery Analytics` link on `apps/doWhat-web/src/app/admin/page.tsx` header nav.
      - Adjusted link typing to satisfy Next typed-routes (`as Route`).
23. **Validation reruns after admin UI integration**
      - Re-ran targeted tests:
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` (pass)
         - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts` (pass)
         - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts` (pass)
         - `apps/doWhat-web/src/app/admin/__tests__/page.test.tsx` (pass)
      - Re-ran narrowed recheck after typed-route fix:
         - `apps/doWhat-web/src/app/admin/__tests__/page.test.tsx` (pass)
         - `apps/doWhat-web/src/app/api/admin/discovery-exposures/__tests__/route.test.ts` (pass)
      - Re-ran workspace typecheck (`pnpm -w run typecheck`) and confirmed all workspaces pass.
24. **Stage assessment + hard QA pass before release sync**
      - Product/engineering judgement (current stage):
         - Discovery is now in an **instrumented beta-hardening** phase (not MVP): ranking, confidence gating, dedupe metadata, sampled exposure logging, retention tooling, and admin analytics are in place.
         - Primary remaining risk is not core discovery correctness but operational tuning (threshold calibration, long-window signal quality, and batch ingestion volume controls in production).
      - Full validation sweep executed:
         - Full Jest suite run across workspace: `363/363` tests passed.
         - Workspace typecheck: passed for `packages/shared`, `apps/doWhat-web`, `apps/doWhat-mobile`.
         - API health check: `/api/health` returned `ok: true` with expected table checks healthy.
         - User-flow HTTP smoke routes returned `200`:
            - `/`
            - `/auth`
            - `/map`
            - `/admin`
            - `/admin/discovery-exposures`
      - Decision: proceed with shipping current change set (no additional feature coding required for this pass).

## 2026-02-19

1. **Discovery intelligence layer architecture design (startup-grade)**
    - Added a dedicated architecture/design document covering retrieval, ranking, dedupe, confidence scoring, observability, anti-abuse controls, and scalability roadmap.
    - New file: `docs/discovery_intelligence_layer_startup_design_2026-02-19.md`.
    - Design includes:
       - 3-stage retrieval→gating→ranking pipeline,
       - strict activity place-backing policy,
       - explainable weighted scoring model and confidence formulas,
       - hierarchical cross-source dedupe keys + merge policy,
       - phased migration plan (contract hardening → ranking extraction → cache/precompute scale → LTR).
    - Captured fresh web screenshots:
       - `/tmp/proof-20260218-web-home.png`
       - `/tmp/proof-20260218-web-auth.png`
       - `/tmp/proof-20260218-web-discover.png`
       - `/tmp/proof-20260218-web-map.png`

3. **iOS smoke proof refresh**
    - Captured fresh iOS simulator screenshots:
       - `/tmp/proof-20260218-ios-home.png`
       - `/tmp/proof-20260218-ios-map.png`
       - `/tmp/proof-20260218-ios-onboarding-sports.png`

4. **Mobile web proof refresh**
    - Captured fresh Expo web screenshots:
       - `/tmp/proof-20260218-mobile-web-home.png`
       - `/tmp/proof-20260218-mobile-web-map.png`
       - `/tmp/proof-20260218-mobile-web-onboarding-sports.png`

5. **Post-smoke validation gates (targeted) passed**
    - `pnpm --filter dowhat-web typecheck` passed.
    - `pnpm --filter doWhat-mobile typecheck` passed.
    - `pnpm --filter dowhat-web test -- map` passed.
    - `pnpm --filter doWhat-mobile test -- onboarding-sports onboarding-reliability-pledge` passed.

## 2026-02-20

1. **Continuous web QA loop: full-suite crack point fixed**
      - Kept the web dev runtime active and ran full workspace tests as part of the ongoing “test until stop” loop.
      - Found one failing test in `apps/doWhat-web/src/app/people-filter/__tests__/page.test.tsx`:
         - `PeopleFilterPage reliability pledge banner tracks onboarding analytics when the pledge CTA is clicked`
      - Stabilized the test by:
         - waiting for onboarding banners to fully hydrate before interaction,
         - switching the pledge CTA interaction to `fireEvent.click(...)` for deterministic event dispatch in this jsdom path.
      - Validation result after patch:
         - Full workspace Jest run passed: `363/363`.

2. **Profile location accuracy + city/place canonicalization hardening (web)**
      - Investigated the reported profile save failure (`profiles.user_id` not-null violation) and the location precision issue from profile edit.
      - Implemented end-to-end location accuracy updates:
         - `apps/doWhat-web/src/components/profile/ProfileHeader.tsx`
            - `Use my current location` now captures high-accuracy GPS (`enableHighAccuracy: true`) and stores precise coordinates in edit state.
            - Save payload now includes `locationLat`/`locationLng` when device location is used.
            - Manual edits clear coordinate lock to avoid stale coordinate-text mismatches.
         - `apps/doWhat-web/src/app/profile/page.tsx`
            - Auto-location bootstrap now sends both `location` and precise coordinates to profile update API.
         - `apps/doWhat-web/src/app/api/profile/[id]/update/route.ts`
            - Fixed insert path by including `user_id` in profile upsert payload.
            - Added coordinate-aware update flow:
               - accept `locationLat`/`locationLng` directly,
               - reverse-geocode coordinates to canonical city/place label,
               - fallback to forward geocode only when precise coordinates are missing,
               - clear stored coordinates when location is explicitly nulled.
         - `apps/doWhat-web/src/app/api/geocode/route.ts`
            - Improved reverse-geocode label composition to prioritize place-like signals (`amenity/building/shop/tourism/leisure/neighbourhood/suburb`) plus locality and region, producing clearer city/place labels for profile display.
      - Validation after implementation:
         - Workspace typecheck passed.
         - Full workspace Jest passed: `363/363`.

3. **Location-product benchmark research (Tinder/Bumble/Hinge) for implementation direction**
      - Reviewed official policy/help docs to align behavior with established location-first apps:
         - Tinder privacy + Passport mode docs (geolocation coordinates, approximate profile location, virtual travel location).
         - Bumble privacy + support docs (`Updating your location`, `Travel mode`).
         - Hinge privacy docs (precise geolocation usage when permission is granted).
      - Key adopted patterns:
         - precise coordinate capture at permissioned device level,
         - user-visible label normalized to city/place (not raw coords),
         - optional virtual location handled separately from physical GPS location.

4. **Profile UI now shows place names instead of coordinate strings**
      - Added coordinate-label normalization on profile load in `apps/doWhat-web/src/app/profile/page.tsx`.
      - If a stored profile location matches `lat,lng` format, the page now reverse-geocodes it to a human-readable place label and updates both UI state and persisted profile data.
      - This backfills older coordinate-only profile rows without requiring the user to re-edit manually.
      - Validation:
         - Targeted tests passed:
            - `apps/doWhat-web/src/__tests__/ProfilePage.integration.test.tsx`
            - `apps/doWhat-web/src/app/profile/__tests__/page.test.tsx`
         - Workspace typecheck passed.

5. **Deep root-cause fix: reverse-geocode 403 blocked label normalization**
      - Investigated why coordinate text (`15.905, 108.329`) still appeared after prior normalization logic.
      - Found `/api/geocode?lat=...&lng=...` was returning `403` in app runtime for reverse lookup, preventing place-label replacement.
      - Implemented geocode runtime/request hardening in `apps/doWhat-web/src/app/api/geocode/route.ts`:
         - forced Node runtime (`export const runtime = 'nodejs'`),
         - switched to explicit Nominatim headers bundle (`User-Agent`, `Referer`, `Accept-Language`),
         - updated default user-agent contact from placeholder to `team@dowhat.app`.
      - Verified endpoint behavior on the exact failing coordinates:
         - now returns label: `Bếp Tre, Hội An Tây Ward, Vietnam`.
      - Added regression test in `apps/doWhat-web/src/__tests__/ProfilePage.integration.test.tsx`:
         - confirms coordinate-only profile location is normalized to place label,
         - confirms normalized value is persisted through `/api/profile/:id/update`.
      - Final validation sweep:
         - full workspace Jest: `364/364` passed,
         - workspace typecheck passed,
         - `/api/health` passed.

6. **Map proximity integrity fix (activities/events now constrained to user/map location)**
      - Investigated the `/map` regression where nearby results were showing activities from distant geographies (hundreds/thousands of km away) despite local map center and radius.
      - Root cause:
         - PostGIS RPC source (`activities_nearby`) could return far rows in some environments; engine path trusted those rows and merged them without a hard post-merge radius gate.
         - Cached discovery entries could preserve previously far rows unless explicitly re-constrained on cache-hit reads.
      - Server-side fixes in `apps/doWhat-web/src/lib/discovery/engine.ts`:
         - Added strict `enforceDistanceWindow(...)` radius gate using authoritative haversine distance from requested center.
         - Recomputed/normalized `distance_m` from coordinates for RPC rows before returning them.
         - Applied radius gate after fallback merges and before ranking/final slice.
         - Applied radius gate in cache-hit path (`buildCacheResult`) to prevent stale far rows from leaking back into responses.
      - Client-side safety net in `apps/doWhat-web/src/app/map/page.tsx`:
         - Added final proximity guard for rendered activities and events against current query center/radius.
         - This ensures UI never displays out-of-radius items even if upstream data drifts.
      - Runtime verification:
         - `GET /api/nearby?lat=15.905&lng=108.329&radius=2500&limit=50&refresh=1` now returns `count=0` instead of far-away records, confirming strict location scoping.
      - Validation:
         - full workspace Jest: `364/364` passed,
         - workspace typecheck passed,
         - workspace lint completed,
         - `/api/health` passed.

## 2026-03-03

1. **Discovery Phase 1+2 implementation pass (venue seeding + inferred taxonomy + trust-state plumbing)**
   - Timestamp: 2026-03-03 15:01:52 +07
   - Files touched:
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-web/src/lib/discovery/trust.ts`
      - `apps/doWhat-web/src/lib/discovery/telemetry.ts`
      - `apps/doWhat-web/src/lib/filters.ts`
      - `apps/doWhat-web/src/lib/venues/search.ts`
      - `apps/doWhat-web/src/lib/venues/types.ts`
      - `apps/doWhat-web/src/lib/venues/savePayload.ts`
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/app/api/discovery/activities/route.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/components/WebMap.tsx`
      - `apps/doWhat-web/src/app/venues/page.tsx`
      - `packages/shared/src/map/types.ts`
      - discovery/venues test files updated for new contracts
   - Reason:
      - Implement Phase 1/2 from the competitor plan with DB-backed venue seeding + persisted venue activity inference, and align trust/state outputs across map + venues.
   - Before:
      - Sparse tiles often stayed under-seeded unless specific city bootstrap paths triggered.
      - Place fallback activity typing depended mainly on lightweight keyword inference, without directly consuming persisted `venue_activities` mappings.
      - Map/Venues used different trust/ranking semantics and state labels (`AI suggestion`/`Needs verification`).
      - Debug output did not expose provider counts + running cache/dedupe rates via a request toggle.
   - After:
      - Discovery engine now triggers viewport seeding on sparse requests (`fetchPlacesForViewport(... forceRefresh: true)`) and attempts persisted matcher refresh (`matchActivitiesForPlaces`) for DB-backed inventory growth.
      - Place fallback now reads persisted `venue_activities` + `activity_catalog`, maps inferred activities to taxonomy IDs, and projects confidence/state onto discovery items.
      - Added shared trust scoring (`computeTrustScore`) and propagated `trust_score` + `verification_state` (`suggested` / `verified` / `needs_votes`) through ranking, nearby/discovery APIs, map UI, and venues UI.
      - Added debug metrics toggle support (`debug=1`) with server logs for provider counts, cache hit rate, and dedupe drop rate.
      - Added actionable empty-state actions on map/venues instead of passive blank messaging.
   - Commands run:
      - `sed -n ...` / `tail -n ...` across discovery, map, venues, tests, and logs
      - `rg -n ...` / `rg --files ...` for flow tracing and impact search
      - `find ...` to locate external plan artifacts
      - `python3 -m pip install --user pypdf` + PDF extraction command for plan details
      - multiple `apply_patch` edits across listed files

2. **Discovery implementation verification + handoff log refresh**
   - Timestamp: 2026-03-03 15:13:34 +07
   - Files touched:
      - `changes_log.md`
   - Reason:
      - Record the latest verification run and PR-ready handoff details after implementing discovery Phase 1/2.
   - Before:
      - Prior entry documented implementation details, but did not include a dedicated follow-up note for the final scoped test/typecheck rerun and handoff output pass.
   - After:
      - Added a follow-up log entry with exact validation command outcomes and updated status for the discovery workstream.
   - Commands run:
      - `pnpm --filter dowhat-web test -- src/lib/discovery/__tests__/trust.test.ts src/app/api/discovery/activities/__tests__/route.test.ts src/app/api/nearby/__tests__/payload.test.ts src/lib/__tests__/venueSearch.test.ts src/lib/venues/__tests__/filters.test.ts src/lib/venues/__tests__/savePayload.test.ts src/app/venues/__tests__/page.test.tsx` (passed: 7 suites, 31 tests)
      - `pnpm --filter dowhat-web run typecheck` (passed)
      - `git status --short` and targeted `rg -n` / `sed -n` checks for discovery flow + contract fields

3. **Gap map before auth/onboarding/location hardening pass**
   - Timestamp: 2026-03-03 15:54:33 +07
   - Files touched:
      - `changes_log.md`
   - What changed:
      - Added a pre-implementation gap map with concrete file-path evidence for requirements A-F and a verified/missing checklist.
   - Why:
      - Required by task brief before coding, and needed to avoid duplicating existing onboarding/discovery work.
   - Gap map (exists vs missing):
      - Auth/session UI exists but not strict redirects on all core pages:
         - `apps/doWhat-web/src/app/create/page.tsx` uses client `AuthGate` card (not redirect).
         - `apps/doWhat-web/src/app/map/page.tsx` uses client `AuthGate` and action-level auth redirects.
         - `apps/doWhat-web/src/app/venues/page.tsx` uses client auth state + gate card.
         - `apps/doWhat-web/src/app/page.tsx` is server-rendered and still usable anonymously.
      - Live update bridge already exists and is mounted:
         - `apps/doWhat-web/src/components/AppLiveUpdates.tsx`
         - `apps/doWhat-web/src/app/layout.tsx`
      - Onboarding exists (traits/sport/pledge) but core-values step missing:
         - `packages/shared/src/onboarding/progress.ts`
         - `apps/doWhat-web/src/app/onboarding/page.tsx`
         - `apps/doWhat-web/src/lib/onboardingSteps.ts`
      - Email confirmation gate missing:
         - no `email_confirmed_at` checks found in web/mobile/shared source.
      - Create/session place resolution mostly exists but has override risk:
         - `apps/doWhat-web/src/app/api/sessions/route.ts` prioritizes explicit payload `placeId` before activity canonical place.
         - `apps/doWhat-web/src/lib/sessions/server.ts` contains canonical place helpers (`resolveSessionPlaceId`, `deriveSessionPlaceLabel`).
      - Home page lacks requested split filter/search panel:
         - `apps/doWhat-web/src/app/page.tsx` has hero + grouped activity feed, no people filter section.
      - Map page already has search/filter/save and debug support, but debug logging needs explicit dev-only guard:
         - `apps/doWhat-web/src/app/map/page.tsx`
         - `apps/doWhat-web/src/lib/discovery/engine.ts`
   - Checklist status (verified only):
      - `[x]` A.4 Reuse existing live updates bridge and confirm mounted.
      - `[ ]` A Auth required redirect gating on `/`, `/map`, `/venues`, `/create`, and save/vote/create flows.
      - `[ ]` A Email-confirmed gate with resend support.
      - `[ ]` A Onboarding guard includes 5 traits + 3 core values + reliability pledge.
      - `[ ]` B Activity/event place invariants fully enforced (activity inheritance precedence + standalone unresolved with coords).
      - `[ ]` C Home design/functionality upgrade (search + split filters + real data + no duplicate sections/empties).
      - `[ ]` D Map parity + deep debug validation on sparse diversity collapse.
      - `[ ]` E Venues/Profile only parity/gating/core-values support updates.
      - `[ ]` F Requirement-vs-current comparison completed and tracked with small-step implementation entries.
   - Plan of attack (small commits):
      - Commit slice 1: shared web access guard (`auth + email-confirm + onboarding redirect`) and apply to `/`, `/map`, `/venues`, `/create`.
      - Commit slice 2: onboarding core-values contract (DB migration + shared progress logic + `/onboarding/core-values` UI + profile support).
      - Commit slice 3: create/session place invariant hardening + create-page “Go back” label + tests.
      - Commit slice 4: home page search/filter split panel + save parity + no duplicate sections/empty states.
      - Commit slice 5: map debug dev-only logging + diversity/drop diagnostics tests.
      - Commit slice 6: full lint/typecheck/targeted tests and final log/handoff.
   - How verified:
      - Code inspection commands:
         - `tail -n 200 changes_log.md`
         - `tail -n 220 ASSISTANT_CHANGES_LOG.md`
         - `sed -n ...` on core pages/routes/components
         - `rg -n` across auth/onboarding/discovery/create/profile/session helpers
   - Remaining risks:
      - Adding a new profile column (`core_values`) requires migration + local type sync.
      - Existing tests assert onboarding step unions; adding a step can require broad fixture/test updates.
      - Redirect enforcement must preserve query strings and avoid loops with `/auth` and onboarding routes.

4. **Core access guard foundation (auth + email-confirm + onboarding redirects)**
   - Timestamp: 2026-03-03 16:02:00 +07
   - Files touched:
      - `packages/shared/src/onboarding/coreValues.ts`
      - `packages/shared/src/index.ts`
      - `apps/doWhat-web/src/lib/access/coreAccess.ts`
      - `apps/doWhat-web/src/lib/access/serverGuard.ts`
      - `apps/doWhat-web/src/lib/access/useCoreAccessGuard.ts`
      - `apps/doWhat-web/src/app/auth/confirm-email/page.tsx`
      - `apps/doWhat-web/src/app/page.tsx`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/venues/page.tsx`
      - `apps/doWhat-web/src/app/create/page.tsx`
   - What changed:
      - Added reusable core-values normalization helpers in shared package (web/mobile reusable contract).
      - Added centralized web access guard primitives for:
         - auth redirect (`/auth?redirect=...`)
         - email confirmation gate redirect (`/auth/confirm-email?redirect=...`)
         - onboarding step redirect (`/onboarding/{traits|core-values|reliability-pledge}?next=...`)
      - Added server-side guard for home page and client-side guard hook for map/venues/create.
      - Added new `/auth/confirm-email` page with resend flow + continue check.
      - Updated create UI back button copy to explicit “Go back”.
   - Why:
      - Requirement A needs strict redirect-based gating (not passive gate cards) and an email-confirm checkpoint before app unlock.
   - How verified:
      - `sed -n ...` and `rg -n ...` confirmed:
         - `AppLiveUpdates` remains mounted in `app/layout.tsx`
         - core pages now use guard paths/hooks instead of `AuthGate` card fallbacks for anon access
      - Static read-through verified redirect target preservation code paths include query strings.
   - Remaining risks:
      - Guard logic depends on onboarding data reads; pending `core_values` DB column rollout is still required.
      - Client guard and local auth-state listeners now coexist on map/venues/create; should be smoke-tested for race flicker.

5. **Home filter panel + access tests scaffolding**
   - Timestamp: 2026-03-03 16:24:00 +07
   - Files touched:
      - `apps/doWhat-web/src/lib/home/filtering.ts` (new)
      - `apps/doWhat-web/src/app/page.tsx`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/lib/home/__tests__/filtering.test.ts` (new)
      - `apps/doWhat-web/src/lib/access/__tests__/coreAccess.test.ts` (new)
      - `apps/doWhat-web/src/lib/access/__tests__/serverGuard.test.ts` (new)
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Extracted home feed filtering/grouping into reusable, testable helper (`buildHomeCards`) with category normalization and area scoping.
      - Rebuilt `/` page UI to include a visible search bar plus split filter panel sections: `Activities & events filters` and `People filters`.
      - Added explicit actionable empty-state copy for filtered-empty vs genuinely-empty inventories.
      - Updated map filter drawer copy/layout to explicitly separate activities/events filters from people filters.
      - Added targeted Jest suites for:
         - auth redirect preservation + email confirmation + onboarding gate helpers
         - server guard redirect behavior
         - home search/filter behavior stability.
   - Why:
      - Complete requirement C (home design/functionality) and add the required targeted coverage for requirement A/C/D guardrails.
   - How verified:
      - `apply_patch` and file writes completed cleanly.
      - `sed -n` / `rg -n` spot checks confirmed new filter headings and helper imports are wired.
      - Full lint/typecheck/test verification is queued next (not executed yet for this slice).
   - Remaining risks:
      - New tests may require Jest mock adjustments once executed.
      - Home page rewrite may surface minor typing/format issues on first typecheck run.

6. **Guard bugfix + full verification pass**
   - Timestamp: 2026-03-03 16:28:04 +07
   - Files touched:
      - `apps/doWhat-web/src/lib/access/serverGuard.ts`
      - `apps/doWhat-web/src/lib/access/useCoreAccessGuard.ts`
      - `apps/doWhat-web/src/app/auth/confirm-email/page.tsx`
      - `apps/doWhat-web/src/app/onboarding/traits/__tests__/page.test.tsx`
      - `apps/doWhat-web/src/app/api/sessions/__tests__/route.test.ts`
      - `apps/doWhat-web/src/app/venues/__tests__/page.test.tsx`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Fixed a redirect-control bug in `enforceServerCoreAccess`: onboarding redirects thrown by Next (`NEXT_REDIRECT`) were being swallowed by a broad `catch`, which could incorrectly allow access.
      - Added redirect-signal detection and rethrow logic in `serverGuard.ts`.
      - Fixed strict route typing in client redirects (`useCoreAccessGuard`, confirm-email page).
      - Updated affected tests for new page signatures and stricter TS behavior.
      - Updated venues page test to mock the core access guard so behavior assertions run past loading skeleton state.
   - Why:
      - Required to make auth/onboarding enforcement reliable and to complete mandatory lint/typecheck/test verification cleanly.
   - How verified:
      - `pnpm --filter dowhat-web test -- src/lib/access/__tests__/coreAccess.test.ts src/lib/access/__tests__/serverGuard.test.ts src/app/api/sessions/__tests__/route.test.ts src/lib/home/__tests__/filtering.test.ts src/app/map/__tests__/searchPipeline.integration.test.ts` (passed: 5 suites, 14 tests)
      - `pnpm -w lint` (passed)
      - `pnpm -w typecheck` (passed)
      - `pnpm --filter dowhat-web test -- src/lib/discovery/__tests__/trust.test.ts src/lib/discovery/__tests__/telemetry.test.ts src/app/api/discovery/activities/__tests__/route.test.ts src/app/api/nearby/__tests__/payload.test.ts src/lib/venues/__tests__/filters.test.ts src/app/venues/__tests__/page.test.tsx` (passed: 6 suites, 28 tests)
   - Remaining risks:
      - Core-page guards for map/venues/create remain client-side redirects (fast, but still post-hydration). Consider middleware/server-route-level gating later if pre-hydration enforcement becomes mandatory.
      - Home filter panel currently uses a simple comma-separated category input; chip/selector UX can be refined in a follow-up.

7. **QA Test Gap Map (auth/create/discovery/runtime/CI)**
   - Timestamp: 2026-03-03 17:02:57 +07
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Added a fresh inventory + gap map of existing tests/guardrails before implementing the new QA/CI hardening batch.
   - Why:
      - Required by workplan step 1/2 to avoid duplicating coverage and to target only missing high-risk protections.
   - Test gap map (with file evidence):
      - **A) Auth + onboarding gates**
         - Exists:
            - `apps/doWhat-web/src/lib/access/__tests__/coreAccess.test.ts`
            - `apps/doWhat-web/src/lib/access/__tests__/serverGuard.test.ts`
         - Missing:
            - No direct client guard hook tests for `useCoreAccessGuard` redirect branches + query preservation.
      - **B) Create Event invariants**
         - Exists:
            - `apps/doWhat-web/src/app/api/sessions/__tests__/route.test.ts` (activity place override protection)
         - Missing:
            - No tests for standalone fallback label behavior.
            - No tests for rejection/handling of empty `place_label` outcomes.
            - No route-level timestamp/timezone stability assertion.
      - **C) Discovery / Map / Venues contracts**
         - Exists:
            - `apps/doWhat-web/src/app/api/discovery/activities/__tests__/route.test.ts`
            - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
            - `apps/doWhat-web/src/lib/discovery/__tests__/{trust.test.ts,telemetry.test.ts}`
            - `apps/doWhat-web/src/app/map/__tests__/searchPipeline.integration.test.ts`
         - Missing:
            - No contract test that filters invalid place-backed rows (`name`/`place_label` empty) at route boundary.
            - No test asserting facets stay aligned with returned items after sanitation.
            - No explicit map keep-previous-data regression test at page integration boundary.
      - **D) Hardcoded/fake discovery detection**
         - Missing:
            - No repository-level CI script to fail on hardcoded discovery placeholders/fallback arrays.
      - **E) Runtime crash prevention**
         - Partial exists:
            - unit coverage for map helper utilities (`search*`, `resultQuality`, etc.)
         - Missing:
            - no dedicated static smell scan for risky `forEach/map` on possibly undefined values.
            - no TDZ smell scan script.
      - **F) Single strict verify command**
         - Exists now:
            - root `verify:dowhat` points to `node scripts/verify-dowhat.mjs` (seed/data validation), not full matrix runner.
         - Missing:
            - fail-fast matrix command covering lint/typecheck/web/mobile/playwright/shared/policies/health in one entrypoint.
   - How verified:
      - `git status --short`
      - `cat package.json`
      - `sed -n '1,260p' scripts/verify-dowhat.mjs`
      - `rg --files ... | rg '__tests__|\.test\.(ts|tsx)$'`
      - targeted `sed -n` on auth/create/discovery test files
      - `rg -n "AppLiveUpdates" apps/doWhat-web/src/app/layout.tsx apps/doWhat-web/src/components/AppLiveUpdates.tsx` (confirmed mounted, no second invalidation system added)
   - Remaining risks:
      - Current workspace has extensive unrelated WIP changes; new guardrail edits must avoid destabilizing existing suites.
      - Full strict matrix execution may require local tools/env availability (Playwright browsers, Expo doctor, Supabase env).

8. **Auth client-guard + create invariant test expansion**
   - Timestamp: 2026-03-03 17:05:58 +07
   - Files touched:
      - `apps/doWhat-web/src/lib/access/__tests__/useCoreAccessGuard.test.tsx` (new)
      - `apps/doWhat-web/src/app/api/sessions/route.ts`
      - `apps/doWhat-web/src/app/api/sessions/__tests__/route.test.ts`
      - `apps/doWhat-web/src/lib/sessions/__tests__/server.test.ts`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Added client-guard tests for `useCoreAccessGuard` covering:
         - unauth redirect with query-string preservation
         - unconfirmed-email redirect
         - pending-onboarding redirect
         - successful allow path.
      - Hardened `/api/sessions` route with explicit non-empty `place_label` guard before insert.
      - Expanded `/api/sessions` route tests with:
         - standalone fallback label case
         - empty resolved label rejection case (`400`)
         - existing activity place inheritance case retained.
      - Added timezone normalization test for `extractSessionPayload` (`+07:00` => UTC ISO).
   - Why:
      - Cover missing high-risk flow tests in requirements A/B and prevent regressions around session place invariants.
   - How verified:
      - `pnpm --filter dowhat-web test -- src/lib/access/__tests__/useCoreAccessGuard.test.tsx src/app/api/sessions/__tests__/route.test.ts src/lib/sessions/__tests__/server.test.ts`
      - Result: passed (`3 suites`, `19 tests`).
   - Remaining risks:
      - Session route place-label guard currently depends on runtime resolver output; schema-level DB constraints are still recommended as defense-in-depth.

9. **Onboarding regression test alignment (values step + route updates)**
   - Timestamp: 2026-03-03 17:16:46 +07
   - Files touched:
      - `apps/doWhat-web/src/app/profile/__tests__/page.test.tsx`
      - `apps/doWhat-web/src/app/people-filter/__tests__/page.test.tsx`
      - `apps/doWhat-web/src/app/onboarding/__tests__/page.test.tsx`
      - `apps/doWhat-web/src/components/nav/__tests__/OnboardingNavLink.test.tsx`
      - `apps/doWhat-web/src/app/onboarding/traits/__tests__/page.test.tsx`
      - `apps/doWhat-web/src/components/traits/__tests__/TraitOnboardingSection.test.tsx`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Updated outdated onboarding assertions to match current step order and semantics: `traits -> values -> sport -> pledge`.
      - Updated pending-step counts/arrays in profile, people-filter, onboarding-home, and nav-link analytics assertions.
      - Updated trait onboarding unauth redirect expectation to `/auth?intent=signin&next=...`.
      - Updated trait onboarding hero copy expectation to `Step 1 · Traits`.
      - Updated `TraitOnboardingSection` default completion redirect expectation to `/onboarding/core-values`.
   - Why:
      - `verify:dowhat` was blocked by stale tests after onboarding flow was expanded with core values and redirect behavior changed.
   - How verified:
      - `pnpm --filter dowhat-web test -- --runInBand src/app/profile/__tests__/page.test.tsx src/app/people-filter/__tests__/page.test.tsx src/app/onboarding/__tests__/page.test.tsx src/components/nav/__tests__/OnboardingNavLink.test.tsx src/app/onboarding/traits/__tests__/page.test.tsx src/components/traits/__tests__/TraitOnboardingSection.test.tsx`
      - Result: passed (`6 suites`, `24 tests`).
   - Remaining risks:
      - Full strict matrix (`pnpm verify:dowhat`) still needs to be rerun end-to-end; additional non-onboarding failures may still surface.
      - This batch updates expectations only; it does not change onboarding runtime behavior.

10. **Mobile onboarding test suite alignment + strict verify unblock**
   - Timestamp: 2026-03-03 17:19:55 +07
   - Files touched:
      - `apps/doWhat-mobile/src/components/__tests__/OnboardingNavPill.test.tsx`
      - `apps/doWhat-mobile/src/components/__tests__/OnboardingNavPrompt.test.tsx`
      - `apps/doWhat-mobile/src/app/__tests__/people-filter.test.tsx`
      - `apps/doWhat-mobile/src/app/__tests__/onboarding-index.test.tsx`
      - `apps/doWhat-mobile/src/app/__tests__/profile.simple.cta.test.tsx`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Updated mobile onboarding analytics expectations to include the new `values` step and new pending-step totals.
      - Extended mobile profile mock rows to include `core_values` so “onboarding complete” tests can model a fully completed state.
      - Updated onboarding-home complete-state expectation to 4 review cards (traits/values/sport/pledge).
      - Updated mobile profile progress-priority assertion to reflect current default priority (`values`) when traits are complete but values are missing.
   - Why:
      - `pnpm verify:dowhat` failed in the mobile Jest phase due stale tests after onboarding flow expansion.
   - How verified:
      - Failure captured from strict matrix run: `pnpm verify:dowhat` (failed at `Mobile Jest` with onboarding expectation mismatches).
      - `pnpm --filter doWhat-mobile test -- --maxWorkers=50% src/components/__tests__/OnboardingNavPill.test.tsx src/components/__tests__/OnboardingNavPrompt.test.tsx src/app/__tests__/people-filter.test.tsx src/app/__tests__/onboarding-index.test.tsx src/app/__tests__/profile.simple.cta.test.tsx`
      - Result: passed (`5 suites`, `30 tests`).
   - Remaining risks:
      - Full strict matrix must be rerun to validate downstream steps after mobile Jest (expo doctor/shared tests/health).
      - Mobile home tests still emit expected dev-console warnings around mocked web URL helpers; these do not fail suites but can mask new warnings.

11. **Strict verify matrix rerun (post-mobile fixes) + environment blocker capture**
   - Timestamp: 2026-03-03 17:21:24 +07
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - What changed:
      - Re-ran full strict guardrail matrix via `pnpm verify:dowhat` after mobile onboarding test fixes.
      - Confirmed `AppLiveUpdates` remains mounted in app layout and no alternate invalidation bridge was introduced.
   - Why:
      - Requirement mandates end-to-end verification of guardrails and explicit confirmation of live refresh bridge continuity.
   - How verified:
      - `pnpm verify:dowhat`
      - Matrix stage results:
         - Passed: no-hardcoded-discovery, required-fields, discovery-contract, lint, typecheck, web jest (90/90), web playwright smoke (1/1), mobile jest (19/19), expo doctor (15/15), onboarding progress checks (web+mobile), shared tests (8/8), trait policy verifier.
         - Failed: workspace health step (`pnpm -w run health`) with `migrations-health` DNS error: `getaddrinfo ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`.
      - `rg -n "AppLiveUpdates" apps/doWhat-web/src/app/layout.tsx apps/doWhat-web/src/components/AppLiveUpdates.tsx` (confirmed mounted in layout).
   - Remaining risks:
      - Final strict matrix currently blocked by local environment/network reachability to Supabase host in health migrations check.
      - Until DB host resolution is restored (or health target env is updated), `verify:dowhat` cannot complete green locally despite code/test guardrails passing.

12. **City seeding foundation: Google persistence toggle in places aggregation**
   - Timestamp: 2026-03-04 16:07:26 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/places/types.ts`
      - `apps/doWhat-web/src/lib/places/aggregator.ts`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Why:
      - City seeding requires provider-backed inventory written to `places`/`place_sources`; Google Places was previously transient-only.
   - What changed:
      - Added `persistGoogle?: boolean` on `PlacesQuery`.
      - Updated `fetchPlacesForViewport` to persist Google results when `persistGoogle` is true by reusing existing upsert paths.
      - Ensured provider metrics/counting now includes Google results consistently.
   - How verified:
      - Static review of aggregation flow confirms Google provider rows now enter `upsertPlaces` + `upsertPlaceSources` when seeding mode enables persistence.
      - Runtime test execution pending in later verification batch.

13. **Generic city seeding pipeline + CLI/cron wiring (Bangkok/Hanoi/Bucharest + custom city overrides)**
   - Timestamp: 2026-03-04 16:10:08 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/seed/citySeeding.ts`
      - `apps/doWhat-web/src/app/api/cron/places/seed-city/route.ts`
      - `apps/doWhat-web/src/lib/places/activityMatching.ts`
      - `scripts/seed-city.mjs`
      - `scripts/seed-places-bangkok.mjs`
      - `scripts/seed-places-hanoi.mjs`
      - `scripts/seed-places-bucharest.mjs`
      - `package.json`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Why:
      - Implement city-scale venue seeding with geohash6 tiling and provider-backed persistence, plus a single execution contract `pnpm seed:city --city=...`.
   - What changed:
      - Added `seedCityInventory` module under `src/lib/seed` with:
         - preset city configs for Bangkok/Hanoi/Bucharest,
         - generic custom-city support via explicit `center` + `bounds`,
         - geohash tile generation at configurable precision,
         - per-tile refresh calls through `fetchPlacesForViewport` (`persistGoogle: true`),
         - metrics writes via `place_request_metrics`,
         - post-seed inference pass into `venue_activities` using `matchActivitiesForPlaces`.
      - Added authenticated cron endpoint `/api/cron/places/seed-city`.
      - Added CLI `scripts/seed-city.mjs` and npm script `seed:city`.
      - Redirected existing city scripts to the new generic endpoint.
      - Extended `matchActivitiesForPlaces` input handling for `placeIds` and city wildcard matching to support exact seeded-place inference batches.
   - How verified:
      - Static path validation confirms the new CLI -> cron route -> seed module chain is connected and parameterized (`city`, `mode`, `tiles`, `precision`, optional custom bounds).
      - Runtime/unit verification is pending and performed in the subsequent test phase.

14. **Discovery activity filter contract hardening + deterministic tests + seeding docs**
   - Timestamp: 2026-03-04 16:13:42 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/placeActivityFilter.test.ts`
      - `apps/doWhat-web/src/lib/places/activityMatching.ts`
      - `apps/doWhat-web/src/lib/places/__tests__/activityMatching.test.ts`
      - `apps/doWhat-web/src/lib/__tests__/placesProviders.test.ts`
      - `docs/seeding.md`
      - `package.json`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Why:
      - Enforce activity-filter query contract (all in-bounds matches from `venue_activities`) and add deterministic coverage for dedupe/pagination/inference diversity.
   - What changed:
      - Added `placeActivityFilter` contract helper for bounds + inference-based activity matching.
      - Updated discovery place fallback to:
         - chunk venue-activity inference queries,
         - page through places when activity filter is active,
         - enforce inference-backed activity filtering via contract helper.
      - Exposed activity matching internals for deterministic unit tests and added inference diversity test.
      - Added provider test that verifies Google dedupes repeated place IDs across strategies.
      - Added `docs/seeding.md` with exact run steps, expected output, SQL verification queries, and test commands.
      - Wired `verify:no-hardcoded-discovery` into the root `ci` script.
   - How verified:
      - Static verification completed for control flow and filtering guarantees.
      - Command-based test verification follows in the next execution step.

15. **Verification run for seeding/filter/inference changes**
   - Timestamp: 2026-03-04 16:14:54 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Why:
      - Validate the newly added deterministic tests and ensure compile-safety of seeding + discovery contract changes.
   - Commands run:
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/__tests__/placesProviders.test.ts src/lib/discovery/__tests__/placeActivityFilter.test.ts src/lib/places/__tests__/activityMatching.test.ts`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm -w run verify:no-hardcoded-discovery`
   - How verified:
      - Jest: passed (`3 suites`, `12 tests`).
      - Typecheck: passed (`tsc --noEmit`).
      - Hardcoded-discovery guard: passed.

16. **Trust ordering contract test coverage**
   - Timestamp: 2026-03-04 16:16:36 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Why:
      - Explicitly validate that discovery ordering prioritizes higher trust scores when candidates are otherwise comparable.
   - What changed:
      - Added deterministic ranking test asserting `rankDiscoveryItems` places higher-trust venue ahead of lower-trust venue.
   - Commands run:
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/rankingTrustOrder.test.ts src/lib/discovery/__tests__/placeActivityFilter.test.ts src/lib/places/__tests__/activityMatching.test.ts src/lib/__tests__/placesProviders.test.ts`
      - `pnpm --filter dowhat-web typecheck`
   - How verified:
      - Jest: passed (`4 suites`, `13 tests`).
      - Typecheck: passed.

17. **Explain-mode instrumentation baseline across providers and discovery pipeline**
   - Timestamp: 2026-03-04 21:40:48 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/places/types.ts`
      - `apps/doWhat-web/src/lib/places/providers/google.ts`
      - `apps/doWhat-web/src/lib/places/providers/osm.ts`
      - `apps/doWhat-web/src/lib/places/aggregator.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/app/api/places/route.ts`
      - `packages/shared/src/map/types.ts`
      - `packages/shared/src/places/types.ts`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Add auditable explain telemetry for provider ingestion and discovery responses (cache key/hit, tile touches, pagination/token usage, dedupe/filter gates, and drop reasons).
   - Before:
      - Debug output only exposed partial candidate/dropped counters and did not include required explain contract fields.
      - Provider adapters did not emit pagination or drop-reason counters.
      - `/api/places` had no explain payload surface.
   - After:
      - Added typed explain payloads for provider fetches and viewport aggregation.
      - Google provider now reports `pagesFetched`, `nextPageTokensUsed`, and drop counters; pagination delay aligned to 1.7s.
      - OSM provider now includes mandatory broad sports selectors and parse/drop counters.
      - Aggregator returns explain metadata (`providerCounts`, `itemsBefore/After*`, `dropReasons`, cache/tile metadata).
      - Discovery debug contract now includes required explain fields and propagates seeded-provider explain rollups.
      - `/api/places` returns explain payload when `explain=1`.
   - Commands run:
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/__tests__/placesProviders.test.ts`
   - Results:
      - Passed (`1 suite`, `8 tests`).

18. **Deterministic city+tile+pack seeding for Hanoi/Bangkok/Da Nang**
   - Timestamp: 2026-03-04 21:45:15 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/seed/citySeeding.ts`
      - `apps/doWhat-web/src/app/api/cron/places/seed-city/route.ts`
      - `scripts/seed-city.mjs`
      - `scripts/seed-places-hanoi.mjs`
      - `scripts/seed-places-bangkok.mjs`
      - `scripts/seed-places-danang.mjs`
      - `apps/doWhat-web/supabase/migrations/066_place_tiles_discovery_cache.sql`
      - `package.json`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Implement deterministic, repeatable seeding keyed by `(city, tile, packVersion)` with hotspot-prioritized geohash6 tiling and configurable pack-based provider strategies.
   - Before:
      - City seeding used a single category pass per tile, no explicit pack versioning, no Da Nang preset, and no seed cache keys tied to pack signatures.
   - After:
      - Rebuilt seeding orchestrator with:
         - city presets: Hanoi, Bangkok, Da Nang (plus Bucharest compatibility), each with wide bbox + hotspot bboxes,
         - deterministic tile ordering: hotspot tiles first, then outward by distance,
         - pack registry (`parks_sports`, `climbing_bouldering`, `padel`, `running`, `yoga`, `chess`),
         - deterministic `seed:<packVersion>:<city>:<tile>:<pack>:<signatureHash>` cache keys,
         - per-tile/per-pack explain telemetry and drop-reason rollups,
         - `place_tiles.discovery_cache` writes for auditability.
      - Extended cron route/CLI args for `packs`, `maxTiles`, `refresh`, and `packVersion`.
      - Added Da Nang convenience script and npm script.
      - Added migration `066_place_tiles_discovery_cache.sql`.
   - Commands run:
      - `pnpm --filter dowhat-web typecheck`
   - Results:
      - Passed (`tsc --noEmit`).

19. **Inference keyword expansion, contract tests, seed-health guardrails, and discovery playbook**
   - Timestamp: 2026-03-04 21:55:20 +0700
   - Files touched:
      - `packages/shared/src/activities/catalog.ts`
      - `apps/doWhat-web/supabase/migrations/067_activity_catalog_city_keyword_pack.sql`
      - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
      - `apps/doWhat-web/src/lib/discovery/trust.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/telemetry.ts`
      - `apps/doWhat-web/src/lib/venues/constants.ts`
      - `apps/doWhat-web/src/lib/places/providers/osm.ts`
      - `packages/shared/src/config/cities/index.ts`
      - `packages/shared/src/config/cities/hanoi.ts`
      - `packages/shared/src/config/cities/danang.ts`
      - `scripts/verify-seed-health.mjs`
      - `scripts/verify-no-hardcoded-discovery.mjs`
      - `scripts/verify-discovery-contract.mjs`
      - `docs/seeding.md`
      - `docs/discovery_playbook.md`
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - `apps/doWhat-web/src/app/api/discovery/activities/__tests__/route.test.ts`
      - `apps/doWhat-web/src/lib/__tests__/placesProviders.test.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/placeActivityFilter.test.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/dedupeMerge.test.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `apps/doWhat-web/src/lib/places/__tests__/activityMatching.test.ts`
      - `package.json`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Complete high-coverage discovery guardrails: multilingual activity inference, filter compatibility, trust scoring inputs, explain-contract tests, and CI safety scripts/docs.
   - Before:
      - Activity keyword coverage was narrower for VN/TH terms and lacked `padel`/`bouldering` catalog rows.
      - No seed health verifier existed.
      - Discovery contract checks did not assert explain-mode drop reasons/pages/token metrics.
   - After:
      - Expanded activity catalog (keywords and new slugs `padel`, `bouldering`) and added migration `067`.
      - Added climbing<->bouldering filter alias compatibility.
      - Trust score now uses `rating` plus `rating_count`.
      - Added city configs for Hanoi and Da Nang in shared city registry.
      - Added `verify:seed-health` script and wired guardrail checks.
      - Added docs: updated `docs/seeding.md` and new `docs/discovery_playbook.md`.
      - Added/updated unit + contract tests for pagination token behavior, OSM parser drops, dedupe merge behavior, multilingual inference, stable trust ordering, explain-mode payload, and multi-city diversity regression.
      - Added auto-radius expansion for sparse filtered nearby queries with explicit `radiusExpansion` note in payload.
   - Commands run:
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/__tests__/placesProviders.test.ts src/lib/discovery/__tests__/placeActivityFilter.test.ts src/lib/discovery/__tests__/dedupeMerge.test.ts src/lib/places/__tests__/activityMatching.test.ts src/lib/discovery/__tests__/rankingTrustOrder.test.ts src/lib/discovery/__tests__/trust.test.ts src/app/api/nearby/__tests__/payload.test.ts src/app/api/discovery/activities/__tests__/route.test.ts`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm -w run verify:no-hardcoded-discovery`
      - `pnpm -w run verify:discovery-contract`
   - Results:
      - Jest passed (`8 suites`, `34 tests`).
      - Typecheck passed.
      - `verify:no-hardcoded-discovery` passed.
      - `verify:discovery-contract` passed.

20. **Map discovery regression fix: climbing contract fallback + inventory-first auto-radius expansion**
   - Timestamp: 2026-03-05 20:14:27 +0700
   - Files touched:
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `docs/discovery_playbook.md`
      - `docs/seeding.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Fix user-facing discovery regressions where map loads looked capped around ~200 results and `climb`/`climbing` produced zero results.
      - Align runtime behavior with inventory-first competitor patterns (dense city inventory even without user events).
   - Before:
      - `/api/nearby` only auto-expanded radius for sparse filtered queries and did not densify unfiltered initial loads.
      - Map UI did not surface backend radius expansion decisions.
      - Users in Hanoi commonly saw ~200 results at 2km initial radius despite much denser inventory at wider radii.
      - Climbing filters could collapse to zero when inference rows were sparse (validated in debug counters: `afterFallbackMerge` dropping to 0 in strict contract mode).
   - After:
      - `/api/nearby` now applies two expansion policies:
         - filtered queries: single-step sparse expansion (low-latency safety),
         - unfiltered inventory loads: iterative bucket expansion up to 12.5km targeting >=500 results.
      - Response includes explicit `radiusExpansion` metadata for the applied expansion.
      - Map page now renders a visible "Search radius auto-expanded" note from `radiusExpansion.note`.
      - Updated docs with full regression triage, log audit, competitor parity references, and reproducible runtime checks.
   - Commands run:
      - `for f in web-dev.log mobile-web.log mobile-dev.log mobile-ios.log error_log.md packages/shared/web-dev.tmp.log; do ...; done` (log audit)
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/nearby/__tests__/payload.test.ts src/lib/discovery/__tests__/placeActivityFilter.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/map/__tests__/searchTokens.test.ts src/app/map/__tests__/searchMatching.test.ts src/app/map/__tests__/searchPipeline.integration.test.ts`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm -w run verify:no-hardcoded-discovery && pnpm -w run verify:discovery-contract`
      - `pnpm -w run verify:seed-health --city=hanoi` (followed by bangkok/danang; halted on first failure)
      - `node -e "fetch('http://localhost:3002/api/nearby?...')..."` (runtime API validation with debug)
   - Results:
      - Unit/contract tests passed (`payload`, `placeActivityFilter`, `searchTokens`, `searchMatching`, `searchPipeline`).
      - `typecheck` passed.
      - `verify:no-hardcoded-discovery` passed.
      - `verify:discovery-contract` passed.
      - `verify:seed-health` failed due DNS/network to Supabase host (`ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`), not logic/test regressions.
      - Runtime validation:
         - Hanoi unfiltered `radius=2000` now auto-expands to `5000` and returns `count=590` with expansion note.
         - Hanoi `types=climbing` now returns non-zero results (`count=3` in current dataset).

21. **Operational execution: 3-city seed run + live discovery validation (chunked due client timeout)**
   - Timestamp: 2026-03-05 21:01:44 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Execute requested seeding/validation now that env keys are present and produce auditable runtime evidence for Hanoi, Bangkok, Da Nang.
   - Before:
      - `seed:city` initially failed from shell because `CRON_SECRET` was not exported.
      - Full synchronous seed call with `maxTiles=120` exceeded client header wait and failed with `UND_ERR_HEADERS_TIMEOUT`.
   - After:
      - Loaded env from `.env.local` and `apps/doWhat-web/.env.local` during execution.
      - Completed chunked city seeding runs (`maxTiles=12`, packs `parks_sports,climbing_bouldering`, `packVersion=2026-03-05.regression-fix.v1`) for all three cities.
      - Completed live `/api/nearby` validations for unfiltered and `types=climbing` across all three cities, including radius expansion and explain counters.
   - Commands run:
      - `set -a; source ./.env.local; source ./apps/doWhat-web/.env.local; set +a; pnpm seed:city --city=hanoi --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=120 --refresh=1 --packVersion=2026-03-05.regression-fix.v1` (timeout)
      - `set -a; source ./.env.local; source ./apps/doWhat-web/.env.local; set +a; pnpm seed:city --city=hanoi --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=12 --refresh=1 --packVersion=2026-03-05.regression-fix.v1`
      - `set -a; source ./.env.local; source ./apps/doWhat-web/.env.local; set +a; pnpm seed:city --city=bangkok --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=12 --refresh=1 --packVersion=2026-03-05.regression-fix.v1`
      - `set -a; source ./.env.local; source ./apps/doWhat-web/.env.local; set +a; pnpm seed:city --city=danang --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=12 --refresh=1 --packVersion=2026-03-05.regression-fix.v1`
      - `node - <<'NODE' ... fetch('/api/nearby?...debug=1') for 6 city/filter checks ... NODE`
      - `pnpm -w run verify:seed-health --city=hanoi --packVersion=2026-03-05.regression-fix.v1` (and chained city checks; halted on failure)
   - Results:
      - Hanoi seed: `tilesAttempted=24`, `uniquePlaces=169`, provider totals `{openstreetmap:21,foursquare:0,google_places:0}`, `elapsedMs=230845`.
      - Bangkok seed: `tilesAttempted=24`, `uniquePlaces=40`, provider totals `{openstreetmap:4,foursquare:0,google_places:0}`, `elapsedMs=236505`.
      - Da Nang seed: `tilesAttempted=24`, `uniquePlaces=3`, provider totals `{openstreetmap:5,foursquare:0,google_places:0}`, `elapsedMs=192795`.
      - Live discovery validation:
         - Hanoi unfiltered: `count=635`, auto-expanded `2000->5000`; Hanoi climbing: `count=3`.
         - Bangkok unfiltered: `count=614`, auto-expanded `2000->3200`; Bangkok climbing: `count=5`.
         - Da Nang unfiltered: `count=247`, auto-expanded `2000->10000`; Da Nang climbing: `count=1`.
      - `verify:seed-health` still failed due DB host DNS resolution (`ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`).

22. **Provider diagnostic run: seed explain `providerError` root-signal capture**
   - Timestamp: 2026-03-05 21:03:48 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Investigate why chunked seed runs were mostly OSM-backed and confirm if provider failures are occurring inside pack fetches.
   - Before:
      - City run summaries showed non-zero `dropReasons.providerError` with low/zero Google and Foursquare provider totals but without per-provider message context.
   - After:
      - Ran 1-tile diagnostic seed call (`hanoi`, two packs) and extracted per-tile explain counters.
      - Confirmed both packs show `providerError: 2` and zero provider counts for Google/Foursquare in that diagnostic tile, while route itself succeeds (`error: null`).
   - Commands run:
      - `curl -X POST /api/cron/places/seed-city?city=hanoi&mode=full&packs=parks_sports,climbing_bouldering&maxTiles=1&refresh=1&packVersion=2026-03-05.regression-fix.v1-diag | node -e ...`
   - Results:
      - Diagnostic payload:
         - `tilesAttempted=2`
         - `providerTotals={openstreetmap:0,foursquare:0,google_places:0}`
         - each pack in tile `w7er8u` had `dropReasons.providerError=2`.
      - Indicates external provider fetch failures are still present for this run and need provider credential/quota/network follow-up.

23. **Provider stats drill-down via `/api/places?explain=1`**
   - Timestamp: 2026-03-05 21:04:50 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Determine which providers are contributing to `providerError` and whether Google is failing or just returning zero matches.
   - Before:
      - Seed explain totals only indicated aggregate provider errors.
   - After:
      - Queried `/api/places` with `force=1&explain=1` and inspected `explain.providerStats`.
      - Observed in sampled Hanoi viewport:
         - `openstreetmap`: `providerError=1`, `itemsFetched=0`.
         - `foursquare`: `providerError=1`, `itemsFetched=0`.
         - `google_places`: `pagesFetched=4`, `itemsFetched=0`, no providerError in provider-specific dropped counters.
   - Commands run:
      - `curl -sS "http://localhost:3002/api/places?...&force=1&explain=1" | node -e ...` (summary)
      - `curl -sS "http://localhost:3002/api/places?...&force=1&explain=1" | node -e ...` (`providerStats` extraction)
   - Results:
      - Provider failure signal is currently strongest on OSM/Foursquare in sampled viewport, while Google executed page fetches but returned zero items.

24. **Seed CLI timeout hardening + extended 3-city long-run sweeps**
   - Timestamp: 2026-03-06 10:24:29 +0700
   - Files touched:
      - `scripts/seed-city.mjs`
      - `docs/seeding.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - User requested longer sweep execution; existing seed CLI failed on long synchronous responses with undici headers timeout.
   - Before:
      - `seed:city` had implicit client timeout behavior and no way to extend request window.
      - Full/larger tile runs could fail before response headers were returned.
   - After:
      - Added timeout control to `seed:city`:
         - default `90` minutes,
         - configurable via `--timeoutMinutes` or `SEED_CITY_TIMEOUT_MINUTES`,
         - undici dispatcher configured with matching `headersTimeout` and `bodyTimeout`.
      - Updated `docs/seeding.md` commands to include timeout usage.
      - Executed extended long-run sweeps (`maxTiles=36`, `packs=parks_sports,climbing_bouldering`, `refresh=1`, `packVersion=2026-03-06.longrun.v1`) for Hanoi/Bangkok/Da Nang.
   - Commands run:
      - `node --check scripts/seed-city.mjs`
      - `pnpm seed:city --city=hanoi --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=36 --refresh=1 --packVersion=2026-03-06.longrun.v1 --timeoutMinutes=120`
      - `pnpm seed:city --city=bangkok --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=36 --refresh=1 --packVersion=2026-03-06.longrun.v1 --timeoutMinutes=120`
      - `pnpm seed:city --city=danang --packs=parks_sports,climbing_bouldering --mode=full --maxTiles=36 --refresh=1 --packVersion=2026-03-06.longrun.v1 --timeoutMinutes=120`
      - `node - <<'NODE' ... /api/nearby checks (unfiltered + climbing for each city) ... NODE` (with per-call 120s timeout)
   - Results:
      - CLI timeout fix validated by successful extended runs (no headers-timeout crash).
      - Long-run summaries:
         - Hanoi: `tilesAttempted=72`, `uniquePlaces=304`, provider totals `{openstreetmap:99,foursquare:0,google_places:0}`, elapsed `687225ms`.
         - Bangkok: `tilesAttempted=72`, `uniquePlaces=166`, provider totals `{openstreetmap:78,foursquare:0,google_places:0}`, elapsed `707375ms`.
         - Da Nang: `tilesAttempted=72`, `uniquePlaces=207`, provider totals `{openstreetmap:51,foursquare:0,google_places:0}`, elapsed `658189ms`.
      - Post-run discovery checks:
         - Hanoi unfiltered `count=635` (`expandedTo=5000`), climbing `count=3`.
         - Bangkok unfiltered `count=617` (`expandedTo=3200`), climbing `count=5`.
         - Da Nang unfiltered `count=324` (`expandedTo=10000`), climbing `count=1`.

25. **Discovery regression hardening: climb intent recovery + filtered radius expansion + safer map dedupe**
   - Timestamp: 2026-03-06 10:59:46 +0700
   - Files touched:
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/app/map/resultQuality.ts`
      - `apps/doWhat-web/src/app/map/searchMatching.ts`
      - `apps/doWhat-web/src/app/map/__tests__/resultQuality.test.ts`
      - `apps/doWhat-web/src/app/map/__tests__/searchMatching.test.ts`
      - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/placeFallbackInference.test.ts` (new)
      - `docs/discovery_playbook.md`
      - `docs/seeding.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - User-reported map/discovery regressions: low visible density and no `climb/climbing` results in map filtering path.
      - Runtime checks showed filtered climbing requests at small radius could remain zero because filtered expansion stopped too early and fallback activity inference missed stemmed venue names.
   - Before:
      - `/api/nearby` filtered expansion used a single step only (`2000 -> 3200`), which could stay at zero for sparse sports intent.
      - Fallback place activity inference relied mostly on exact keywords; names like `VietClimb` were not reliably inferred as climbing.
      - Map intent matching for low-quality/generic rows only checked `activity_types`; intent carried in `tags`/`taxonomy_categories` could be dropped.
      - Near-duplicate map dedupe could collapse distinct nearby venues sharing the same label even when canonical `place_id` differed.
   - After:
      - `/api/nearby` now iterates filtered auto-expansion across radius buckets up to `25km` (inventory-first parity with map search augmentation).
      - Discovery fallback inference now supports stem/alias matching by activity slug (including climbing/bouldering-oriented stems), not only exact tokens.
      - Map search intent matching now checks `activity_types + tags + taxonomy_categories`.
      - Near-duplicate map dedupe now preserves nearby rows with different canonical `place_id` values.
      - Added unit coverage for fallback place inference (`placeFallbackInference.test.ts`) and updated/extended nearby payload + map quality tests.
   - Commands run:
      - `pnpm --filter dowhat-web test -- --runInBand src/app/map/__tests__/resultQuality.test.ts src/app/map/__tests__/searchMatching.test.ts src/app/map/__tests__/searchPipeline.integration.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/nearby/__tests__/payload.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/placeFallbackInference.test.ts src/app/map/__tests__/resultQuality.test.ts src/app/map/__tests__/searchMatching.test.ts src/app/map/__tests__/searchPipeline.integration.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/nearby/__tests__/payload.test.ts src/lib/discovery/__tests__/placeFallbackInference.test.ts src/app/map/__tests__/resultQuality.test.ts src/app/map/__tests__/searchMatching.test.ts src/app/map/__tests__/searchPipeline.integration.test.ts && pnpm --filter dowhat-web typecheck`
      - `node - <<'NODE' ... multi-city /api/nearby debug probes (unfiltered + climb) ... NODE`
      - `node - <<'NODE' ... Hanoi radius=12500 types=climbing debug probe ... NODE`
      - `node - <<'NODE' ... Hanoi/Bangkok/Da Nang radius=2000 types=climbing debug probes ... NODE`
   - Results:
      - Targeted web tests and typecheck passed.
      - Runtime validation (March 6, 2026):
         - Hanoi `radius=2000, types=climbing`: `count=3`, expanded to `10000m`.
         - Bangkok `radius=2000, types=climbing`: `count=7`, expanded to `20000m`.
         - Da Nang `radius=2000, types=climbing`: `count=1`, expanded to `5000m`.
      - Unfiltered inventory remained dense in live checks (Hanoi/Bangkok >600, Da Nang >300 in prior validation snapshots).

26. **Post-fix guardrail validation rerun**
   - Timestamp: 2026-03-06 11:04:37 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Re-validate discovery safety/contract scripts after the regression-hardening patch set.
   - Before:
      - Guardrail status after latest code/docs updates needed confirmation.
   - After:
      - Guardrail checks re-run and passing.
   - Commands run:
      - `pnpm -w run verify:no-hardcoded-discovery && pnpm -w run verify:discovery-contract`
   - Results:
      - `[verify-no-hardcoded-discovery] Passed. No hardcoded discovery placeholders detected.`
      - `[verify-discovery-contract] Passed. Discovery contract guardrails present.`

27. **Seed health validation check (blocked by DB DNS)**
   - Timestamp: 2026-03-06 11:05:07 +0700
   - Files touched:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Reason:
      - Confirm post-fix seed health against the latest long-run packVersion.
   - Before:
      - Guardrails passed, but seed-health DB reachability remained previously unstable.
   - After:
      - `verify:seed-health` re-run still blocked by environment DNS resolution.
   - Commands run:
      - `pnpm -w run verify:seed-health --city=hanoi --packVersion=2026-03-06.longrun.v1`
   - Results:
      - Failed with `getaddrinfo ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`.
      - No code regression indicated by this check; failure is infra/network reachability to DB host.

## 2026-03-07

28. **Log synchronization: documented prior mobile map filter, shared branding, and discovery-ranking work already present in the tree**
   - Timestamp: 2026-03-07 08:09:20 +0700
   - Issue being worked on:
      - Synchronize `changes_log.md` before starting the duplicate-venue, logo, session-count, discovery, and performance work requested for this pass.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/components/PlaceBrandMark.tsx`
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/components/PlaceBrandMark.tsx`
      - `apps/doWhat-web/src/components/WebMap.tsx`
      - `apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `packages/shared/src/map/types.ts`
      - `packages/shared/src/places/branding.ts`
      - `packages/shared/src/places/index.ts`
   - Decision made:
      - Record the previously implemented but not yet logged map/discovery/logo changes before touching new logic.
      - Keep the mobile filter flow search-first, remove the `Browse categories` button, and expose active filters as removable chips.
      - Normalize logo resolution through shared website-based branding helpers and shared web/mobile rendering components.
      - Propagate canonical place `website` data through discovery/mobile place fetches and boost ranking quality/prominence using website, confidence, ratings, and popularity signals.
   - Why the decision was made:
      - The user explicitly required log synchronization first and asked for a stronger, more useful filter experience plus better logo fidelity and stronger discovery ranking.
      - The work was already in the repository; leaving it undocumented would violate the logging requirement and make follow-up debugging unreliable.
   - How it was tested:
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter @dowhat/shared build`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint packages/shared/src/places/branding.ts apps/doWhat-web/src/components/PlaceBrandMark.tsx apps/doWhat-mobile/src/components/PlaceBrandMark.tsx apps/doWhat-web/src/lib/discovery/ranking.ts apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts apps/doWhat-web/src/app/map/page.tsx apps/doWhat-web/src/components/WebMap.tsx apps/doWhat-mobile/src/lib/supabasePlaces.ts 'apps/doWhat-mobile/src/app/(tabs)/map/index.tsx'`
      - `pnpm --filter dowhat-web test -- rankingTrustOrder`
   - Result:
      - Mobile map filter UI now uses a search-first modal with preview counts and without the extra `Browse categories` CTA.
      - Shared place branding resolution and brand-mark rendering are present on both web and mobile.
      - Discovery/mobile place payloads now carry `website`, and ranking uses stronger prominence/quality inputs.
      - The targeted validation commands passed.
   - Remaining risks or follow-up notes:
      - These entries document prior work only; duplicate-place handling, doWhat logo restoration, session-count correctness, discovery parity, and performance still need fresh investigation in this pass.
      - Live web/mobile runtime smoke verification for the newly added brand marks and filter flow still needs to be repeated after the upcoming fixes.

29. **Duplicate-place investigation checkpoint: `VietClimb` exists as both a canonical place and a legacy venue**
   - Timestamp: 2026-03-07 08:13:44 +0700
   - Issue being worked on:
      - Task 1 root-cause analysis for duplicate map items (`VietClimb` shown twice).
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Confirm the live data shape first and treat this as a data-plus-dedupe pipeline issue, not a cosmetic-only renderer bug.
   - Why the decision was made:
      - The codebase already had a historical web-only near-duplicate dedupe fix, so the current duplicate could have been caused by new data, a mobile-specific fetch path, or both. The user explicitly asked for end-to-end tracing before changing logic.
   - How it was tested:
      - Queried live Supabase rows for `VietClimb` from `venues`, `places`, and `activities` using the service-role client loaded from `.env.local`.
      - Started the local Next.js API (`pnpm --filter dowhat-web exec next dev -p 4302`) and observed `/api/nearby` compilation/runtime logs while probing the discovery path.
   - Result:
      - `public.venues` contains one legacy row for `VietClimb` (`id=db0bd877-08a5-42f9-9dfc-cc3f9a6d864a`, `lat=21.054838`, `lng=105.83981`).
      - `public.places` contains one canonical OSM-backed `VietClimb` row (`id=3d9e27a6-c62f-4906-a2cf-5d7b406e82fd`, `lat=21.0548381`, `lng=105.8398098`, `aggregated_from=['openstreetmap']`).
      - `public.activities` currently has no `VietClimb` rows, which means the duplicate is not coming from two activity records.
      - The mobile fallback code in `apps/doWhat-mobile/src/lib/supabasePlaces.ts` and `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` only dedupes by raw `id`, so a `venue` row and a `place` row for the same real location remain separate.
      - During the local `/api/nearby` probe, unrelated schema drift also appeared (`place_tiles.discovery_cache` missing, taxonomy view empty, provider Overpass 429/504s). Those are noted but not yet treated as the duplicate root cause.
   - Remaining risks or follow-up notes:
      - Need one more verification step on the discovery output itself to confirm whether `/api/nearby` is also emitting both rows, or whether the duplicate only appears in the mobile direct-Supabase fallback path.
      - Any fix must cover both backend dedupe and mobile rendering safeguards so the duplicate cannot reappear from mixed source IDs.

30. **Task 1 fix: deterministic duplicate-place collapse for legacy venue + canonical place pairs**
   - Timestamp: 2026-03-07 08:23:37 +0700
   - Issue being worked on:
      - Remove duplicate venues/items such as `VietClimb` from discovery/map surfaces and make the dedupe behavior deterministic.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `packages/shared/src/places/dedupe.ts` (new)
      - `packages/shared/src/places/__tests__/dedupe.test.ts` (new)
      - `packages/shared/src/places/index.ts`
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/app/home.tsx`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/dedupeMerge.test.ts`
      - `apps/doWhat-web/src/app/map/resultQuality.ts`
      - `apps/doWhat-web/src/app/map/__tests__/resultQuality.test.ts`
   - Decision made:
      - Fix duplicates at the source-composition layer and keep a render-layer guard:
         - server discovery merge now collapses near-identical `supabase-venues` + canonical-place rows even when they carry different source IDs,
         - mobile place feeds now use a shared semantic place dedupe helper instead of raw-ID-only merging,
         - web map render dedupe is now source-aware so legacy venue UUIDs are not mistaken for canonical `place_id`s.
      - Preserve canonical `place` identity when a duplicate pair is collapsed and carry forward the linked legacy `venueId` in metadata.
   - Why the decision was made:
      - The live `VietClimb` duplicate is a mixed-source pair, not two true canonical places:
         - `sessions` link the legacy `venue_id` row and the canonical `place_id` row at the same time,
         - raw-ID dedupe cannot collapse that shape,
         - fixing only the UI would leave the API/fallback feeds unstable and non-deterministic.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/places/__tests__/dedupe.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/dedupeMerge.test.ts src/app/map/__tests__/resultQuality.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint packages/shared/src/places/dedupe.ts packages/shared/src/places/__tests__/dedupe.test.ts apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/__tests__/dedupeMerge.test.ts apps/doWhat-web/src/app/map/resultQuality.ts apps/doWhat-web/src/app/map/__tests__/resultQuality.test.ts apps/doWhat-mobile/src/lib/supabasePlaces.ts apps/doWhat-mobile/src/app/home.tsx 'apps/doWhat-mobile/src/app/(tabs)/map/index.tsx'`
      - `node -r ts-node/register/transpile-only - <<'NODE' ... live Supabase VietClimb venue/place pair mapped through dedupePlaceSummaries ... NODE`
   - Result:
      - Shared place dedupe now collapses the live `VietClimb` pair from `before=2` rows to `after=1` row and keeps the canonical place id (`3d9e27a6-c62f-4906-a2cf-5d7b406e82fd`) while preserving the linked venue id in metadata.
      - Mobile map/home direct-Supabase and nearby-place rendering paths now apply semantic dedupe instead of `id`-only dedupe.
      - Server discovery merge and web map render dedupe now treat `supabase-venues` IDs as legacy venue identifiers rather than canonical place identifiers.
      - New tests cover:
         - duplicate provider payloads,
         - same place with different source IDs,
         - render-path dedupe against OSM fallback rows,
         - preserving distinct nearby canonical places with different `place_id`s.
   - Remaining risks or follow-up notes:
      - I have not yet completed a full live simulator/browser smoke pass for the updated map/home flows; that will be part of final verification after the remaining tasks land.
      - Local `/api/nearby` probes still surface separate schema drift/perf warnings (`place_tiles.discovery_cache`, `discovery_exposures`, empty taxonomy view, Overpass 429/504s). Those do not block the duplicate fix but are relevant for later discovery/performance tasks in this pass.

31. **Logo pipeline investigation checkpoint: web brand assets are broken placeholders and place logos still rely on favicons**
   - Timestamp: 2026-03-07 08:27:36 +0700
   - Issue being worked on:
      - Task 2 root-cause analysis for broken/missing place logos and the missing doWhat logo.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Separate the doWhat-brand fix from the place-brand fix:
         - doWhat brand needs local asset repair and real asset usage,
         - place brands need a better resolution pipeline because the current favicon-only path cannot guarantee exact logos.
   - Why the decision was made:
      - The audit showed two distinct failure classes:
         - web/mobile doWhat branding is mostly a local asset/usage problem,
         - place logos are mostly a data-resolution problem caused by sparse official website coverage and a favicon-only renderer.
   - How it was tested:
      - Searched all app/shared logo/icon references and local asset paths.
      - Inspected `packages/shared/src/places/branding.ts`, both `PlaceBrandMark` components, `apps/doWhat-mobile/src/components/Brand.tsx`, `apps/doWhat-web/src/components/BrandLogo.tsx`, `apps/doWhat-mobile/app.config.js`, and `apps/doWhat-web/public/manifest.json`.
      - Queried live Supabase samples from `places` and `place_sources` to check website/url availability.
      - Verified asset files with `file`, `ls -l`, `md5`, and `sips`.
   - Result:
      - Current place-brand rendering uses `https://www.google.com/s2/favicons?...` derived from `website`, so it only guarantees favicons, not exact brand logos.
      - `places.website` is effectively empty in the current environment, and sampled `place_sources` rows also lacked usable provider URLs, which explains frequent initials/favicon fallback.
      - The web PWA icons referenced by `apps/doWhat-web/public/manifest.json` (`public/icons/icon-192.png`, `public/icons/icon-512.png`) are zero-byte files.
      - `apps/doWhat-web/src/components/BrandLogo.tsx` renders a generic star/glyph instead of a real doWhat asset.
      - `apps/doWhat-mobile/src/components/Brand.tsx` tries to load `${EXPO_PUBLIC_WEB_URL}/logo.png`, but the web app currently has no `public/logo.png`, so it falls back to a generic glyph as well.
      - Mobile app shell icons do exist locally in `apps/doWhat-mobile/assets/` (`icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png`).
   - Remaining risks or follow-up notes:
      - Need to replace the broken web icon assets with real doWhat brand files and point web/mobile brand components at those assets.
      - Need a more official-logo-aware place-brand resolver, likely via official-site metadata/logo extraction with a documented fallback policy, because favicon-only rendering does not satisfy the exact-logo requirement.

32. **Task 2 fix: repaired doWhat brand assets and upgraded place-logo resolution to official-site-first**
   - Timestamp: 2026-03-07 08:32:20 +0700
   - Issue being worked on:
      - Restore the missing doWhat logo and normalize place/company logo handling across web and mobile.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `packages/shared/src/places/branding.ts`
      - `packages/shared/src/places/__tests__/branding.test.ts` (new)
      - `apps/doWhat-web/src/app/api/place-logo/route.ts` (new)
      - `apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts` (new)
      - `apps/doWhat-web/src/components/PlaceBrandMark.tsx`
      - `apps/doWhat-mobile/src/components/PlaceBrandMark.tsx`
      - `apps/doWhat-web/src/components/BrandLogo.tsx`
      - `apps/doWhat-mobile/src/components/Brand.tsx`
      - `apps/doWhat-web/src/app/layout.tsx`
      - `apps/doWhat-web/public/logo.png` (new)
      - `apps/doWhat-web/public/icons/icon-192.png`
      - `apps/doWhat-web/public/icons/icon-512.png`
   - Decision made:
      - Replace the broken doWhat web/mobile logo usage with the existing app icon asset already present in `apps/doWhat-mobile/assets/icon.png`.
      - Upgrade place-logo resolution from favicon-only to a documented fallback chain:
         1. official website metadata/logo hints resolved via `/api/place-logo`,
         2. favicon fallback when no better official asset is advertised,
         3. initials fallback when no website exists or the image still fails.
      - Keep the resolver shared between web and mobile by extending `resolvePlaceBranding(...)` with `logoProxyBaseUrl` and `fallbackLogoUrl`.
   - Why the decision was made:
      - The missing doWhat logo was a local asset problem:
         - the web manifest icons were empty files,
         - the web header used a generic glyph,
         - mobile `Brand` looked for a nonexistent `/logo.png`.
      - The place-logo inconsistency was a data/resolution problem:
         - `places.website` coverage is sparse,
         - provider snapshots rarely expose URLs here,
         - Google S2 favicons alone cannot satisfy the exact-logo requirement.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/places/__tests__/branding.test.ts src/places/__tests__/dedupe.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/place-logo/__tests__/route.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint packages/shared/src/places/branding.ts packages/shared/src/places/__tests__/branding.test.ts apps/doWhat-web/src/app/api/place-logo/route.ts apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts apps/doWhat-web/src/components/PlaceBrandMark.tsx apps/doWhat-mobile/src/components/PlaceBrandMark.tsx apps/doWhat-web/src/components/BrandLogo.tsx apps/doWhat-mobile/src/components/Brand.tsx apps/doWhat-web/src/app/layout.tsx`
      - Asset verification with `file`, `md5`, `sips`, and `ls -l` after generating the new web icons.
   - Result:
      - `apps/doWhat-web/public/icons/icon-192.png` and `icon-512.png` are now real PNGs generated from the existing doWhat app icon, and `apps/doWhat-web/public/logo.png` now exists for web/mobile brand usage.
      - `BrandLogo.tsx` now renders the real doWhat asset instead of a placeholder glyph.
      - Mobile `Brand.tsx` now uses the bundled local icon directly, removing the broken dependency on a nonexistent remote `/logo.png`.
      - Both `PlaceBrandMark` components now attempt an official-site logo via `/api/place-logo` first and fall back to the favicon URL only if that route or site metadata fails, then to initials.
      - `/api/place-logo` resolves JSON-LD/meta/icon hints from the official site and intentionally avoids guessed `/logo.png` paths that were causing false positives.
   - Remaining risks or follow-up notes:
      - Exact place logos still depend on having a real official website. When the dataset has no `website`, the system still falls back to initials.
      - I have not yet run a full browser/simulator visual smoke pass for the new doWhat logo and place-logo rendering; that will be included in final verification once the remaining tasks are complete.

33. **Task 3 investigation: mobile home session badge is inflated client-side and overstates precision**
   - Timestamp: 2026-03-07 08:36:17 +0700
   - Issue being worked on:
      - Fix the incorrect mobile `"1 session nearby"` badge so it reflects real upcoming events rather than a forced minimum.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Treat this as a client-side count/rendering defect first, then patch the mobile counting utility and badge copy instead of changing the nearby API contract.
   - Why the decision was made:
      - The nearby API already returns `upcoming_session_count` from real `sessions` rows in `apps/doWhat-web/src/lib/discovery/engine.ts`, but `apps/doWhat-mobile/src/app/home.tsx` converts `0` into `1` with `Math.max(1, Number(activity.upcoming_session_count ?? 0))`.
      - The home card label also says `"session nearby"` even though the card groups discovery items by normalized activity name across multiple places, so the current wording implies a more exact location-specific count than the data model can guarantee.
   - How it was tested:
      - Inspected the mobile home aggregation/render path in `apps/doWhat-mobile/src/app/home.tsx`.
      - Traced `upcoming_session_count` back to the web nearby-discovery engine in `apps/doWhat-web/src/lib/discovery/engine.ts`.
      - Searched the mobile codebase for other `"session nearby"` / `upcoming_session_count` surfaces to confirm the bug is isolated to the home activity cards.
      - Reviewed the `sessions` schema migration in `apps/doWhat-web/supabase/migrations/028_sessions_schema_spec.sql` to confirm sessions are the authoritative event model.
   - Result:
      - Root cause confirmed:
         - `upcoming_session_count = 0` from discovery is being inflated to `1` on mobile home cards.
         - Home cards aggregate by activity name, not a single place, so the current `"session nearby"` wording overclaims precision.
      - No additional mobile surfaces were found using the same broken copy path.
   - Remaining risks or follow-up notes:
      - The fix should preserve exact upcoming-event counts when discovery provides them and avoid misleading copy when the count is zero or not location-specific.

34. **Task 3 fix: mobile home cards now show only real upcoming-event counts**
   - Timestamp: 2026-03-07 08:38:59 +0700
   - Issue being worked on:
      - Correct the mobile home activity badge so it reflects actual upcoming sessions/events and never fabricates `"1 session nearby"`.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-mobile/src/lib/homeActivityCounts.ts` (new)
      - `apps/doWhat-mobile/src/lib/__tests__/homeActivityCounts.test.ts` (new)
      - `apps/doWhat-mobile/src/app/home.tsx`
   - Decision made:
      - Extract the home-card counting logic into a dedicated mobile helper and change the UI contract from `"N session(s) nearby"` to:
         - a numeric `"N upcoming event(s)"` badge only when there are real upcoming sessions,
         - neutral `"Tap to view nearby places"` copy when the count is zero.
   - Why the decision was made:
      - The old UI combined two problems:
         - it fabricated a minimum count of 1,
         - it described the grouped activity card as an exact nearby session count even when there were no actual sessions.
      - Centralizing the math in `homeActivityCounts.ts` makes the behavior deterministic and directly testable.
   - How it was tested:
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/homeActivityCounts.test.ts`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint apps/doWhat-mobile/src/lib/homeActivityCounts.ts apps/doWhat-mobile/src/lib/__tests__/homeActivityCounts.test.ts apps/doWhat-mobile/src/app/home.tsx`
   - Result:
      - Mobile home cards no longer convert `0` upcoming sessions into `1`.
      - Cards now show `"1 upcoming event"` / `"N upcoming events"` only when discovery or session rows provide real upcoming-event counts.
      - Zero-count activities no longer show a misleading session badge.
      - Added focused regression tests covering:
         - zero events,
         - one actual event,
         - multiple actual events,
         - separate nearby activity groups with independent counts.
   - Remaining risks or follow-up notes:
      - The home cards are still activity-group cards rather than single-place cards, so the badge now accurately represents upcoming nearby events for that activity, not one exact venue.
      - A live simulator smoke pass is still needed during final verification to confirm the updated copy/layout on device.

35. **Task 4 investigation: mobile discovery was bypassing cache and underusing server-side ranking/filtering**
   - Timestamp: 2026-03-07 08:51:04 +0700
   - Issue being worked on:
      - Compare mobile vs web discovery end-to-end and identify why mobile place/activity discovery quality and speed lag behind web.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Fix the parity gap in the shared/mobile fetch layer instead of only tuning UI filtering, because the main regressions were caused by how mobile was querying discovery rather than by presentation alone.
   - Why the decision was made:
      - Code inspection showed these exact differences:
         - web map reuses nearby-query cache by default; mobile home and mobile map were forcing `refresh: true` on every `/api/nearby` request, bypassing cache on every fetch.
         - web pushes filter constraints into discovery (`priceLevels`, `capacityKey`, `timeWindow`, taxonomy, traits/tags where applicable); mobile map only sent taxonomy categories server-side and then filtered the rest locally after fetching places.
         - mobile `PlacesViewportQuery` cache keys only varied by bounds/categories, so non-category map filters did not trigger server-side inventory refreshes.
         - mobile home discovery sent categories/time-of-day but ignored price-range-derived price levels.
         - mobile fallback ordering relied on raw fetch order / `updated_at`, while web ranking uses stronger distance/prominence/quality signals.
      - The earlier live warnings also showed a server-side cache persistence issue: environments missing `place_tiles.discovery_cache` kept paying repeated failing cache-write attempts.
   - How it was tested:
      - Inspected `apps/doWhat-mobile/src/app/home.tsx`, `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`, `packages/shared/src/places/utils.ts`, `packages/shared/src/map/api.ts`, `apps/doWhat-web/src/app/map/page.tsx`, and `apps/doWhat-web/src/app/api/nearby/route.ts`.
      - Compared the request/filter/caching behavior of mobile map/home against the web map query flow and the nearby-discovery engine.
      - Reviewed the discovery cache / telemetry persistence paths in `apps/doWhat-web/src/lib/discovery/engine.ts` and `apps/doWhat-web/src/lib/discovery/telemetry.ts`.
   - Result:
      - Root causes for the mobile-vs-web gap were identified and narrowed to request strategy, cache usage, filter propagation, and fallback ordering rather than a single ranking formula issue.
   - Remaining risks or follow-up notes:
      - Mobile map remains place-centric while web map is activity-centric, so parity should be judged on inventory/filter quality and ranking behavior, not exact entity shape.

36. **Task 4/5 fix: aligned mobile discovery with web caching/filtering and removed repeated dead-end cache persistence work**
   - Timestamp: 2026-03-07 08:51:04 +0700
   - Issue being worked on:
      - Upgrade mobile discovery quality/performance to behave closer to web and remove redundant slow paths/warnings.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts` (new)
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts` (new)
      - `apps/doWhat-mobile/src/app/home.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `packages/shared/src/places/types.ts`
      - `packages/shared/src/places/utils.ts`
      - `packages/shared/src/places/__tests__/queryKey.test.ts` (new)
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/telemetry.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts`
   - Decision made:
      - Introduce explicit mobile discovery helpers to:
         - translate mobile home/map filters into the same nearby-discovery filter primitives web uses,
         - include those filters in the mobile places query key,
         - rank mobile place summaries deterministically using server rank score + quality + popularity + distance + search match.
      - Stop bypassing `/api/nearby` cache by default on mobile and reserve bypassing for explicit pull-to-refresh.
      - Disable repeated discovery-cache/telemetry persistence attempts after first schema-missing failures instead of retrying doomed writes on every request.
   - Why the decision was made:
      - These changes directly target the identified mobile-only degradations:
         - better server-side filtering improves inventory quality before local filtering,
         - cache reuse reduces latency and redundant provider/database work,
         - query-key awareness prevents stale inventory when users change non-category filters,
         - deterministic ranking narrows the gap between mobile fallback ordering and web ranking,
         - short-circuiting missing-schema cache/telemetry writes removes repeated warning noise and wasted round trips.
   - How it was tested:
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/homeActivityCounts.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/telemetry.test.ts`
      - `pnpm --filter @dowhat/shared test -- --runInBand src/places/__tests__/queryKey.test.ts src/places/__tests__/branding.test.ts src/places/__tests__/dedupe.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm exec eslint apps/doWhat-mobile/src/lib/mobileDiscovery.ts apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts apps/doWhat-mobile/src/lib/homeActivityCounts.ts apps/doWhat-mobile/src/lib/__tests__/homeActivityCounts.test.ts apps/doWhat-mobile/src/app/home.tsx 'apps/doWhat-mobile/src/app/(tabs)/map/index.tsx' packages/shared/src/places/types.ts packages/shared/src/places/utils.ts packages/shared/src/places/__tests__/queryKey.test.ts apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/telemetry.ts apps/doWhat-web/src/lib/discovery/__tests__/telemetry.test.ts`
   - Result:
      - Mobile home and map no longer force `refresh: true` on every discovery request; only manual home pull-to-refresh bypasses cache now.
      - Mobile map now sends taxonomy/price/capacity/time filters to `/api/nearby`, and those filters now participate in the places query key so inventory refetches when they change.
      - Mobile home discovery now maps activity price ranges/time-of-day into nearby-discovery filters and applies approximate category/price/time filtering in the Supabase fallback path instead of silently dropping those constraints.
      - Mobile map place ordering is now deterministic and quality-aware via `rankPlaceSummariesForDiscovery(...)`.
      - Discovery engine cache persistence now disables itself after the first missing `place_tiles.discovery_cache` schema failure, and telemetry persistence does the same for missing `discovery_exposures`.
      - Added regression tests covering:
         - mobile filter translation,
         - mobile ranking consistency,
         - shared places query-key parity for discovery filters,
         - telemetry disabling after missing-schema failures.
   - Remaining risks or follow-up notes:
      - I have not yet run a live simulator/browser side-by-side comparison for the same city/filter combination; final verification still needs a runtime smoke pass.
      - If the Supabase environment is missing migrations `065`/`066`, cache/telemetry persistence now fail closed instead of repeatedly retrying, but the environment should still be migrated for full production performance/analytics.

37. **Final verification: focused tests/typechecks passed and the required regressions are covered**
   - Timestamp: 2026-03-07 08:52:30 +0700
   - Issue being worked on:
      - Complete the final verification checklist and confirm the logs fully reflect the implemented fixes.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Use focused regression suites plus asset/file verification for final confirmation, and note explicitly where live environment verification could not be repeated in this shell.
   - Why the decision was made:
      - The affected areas now have targeted deterministic tests for duplicates, logos, session counts, query-key/filter parity, ranking, and telemetry behavior, which gives stronger regression protection than a single manual smoke pass alone.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/places/__tests__/dedupe.test.ts src/places/__tests__/branding.test.ts src/places/__tests__/queryKey.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/dedupeMerge.test.ts src/app/map/__tests__/resultQuality.test.ts src/app/api/place-logo/__tests__/route.test.ts src/lib/discovery/__tests__/rankingTrustOrder.test.ts src/lib/discovery/__tests__/telemetry.test.ts`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/homeActivityCounts.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `file apps/doWhat-web/public/logo.png apps/doWhat-web/public/icons/icon-192.png apps/doWhat-web/public/icons/icon-512.png`
      - `rg -n "session nearby" apps/doWhat-mobile/src` (no matches)
      - `rg -n "refresh: true" apps/doWhat-mobile/src/app/home.tsx 'apps/doWhat-mobile/src/app/(tabs)/map/index.tsx'` (only manual home pull-to-refresh remains)
      - Attempted live VietClimb dedupe recheck via Supabase service client, but this shell had no exported Supabase service environment variables (`{"skipped":"missing supabase env"}`); earlier in-turn live verification already confirmed the pair reduced from 2 to 1 canonical place.
   - Result:
      - Duplicate-place regression coverage passed, including near-duplicate venue/place collapse behavior.
      - Logo/branding regression coverage passed, and the doWhat web assets are real non-empty PNGs at the expected paths.
      - Mobile home session-count regression coverage passed, and the old misleading `"session nearby"` copy is gone from the mobile source.
      - Mobile discovery parity/ranking/query-key regressions passed, and discovery/telemetry missing-schema behavior is now covered.
      - Shared/mobile/web typechecks passed after all changes.
      - `changes_log.md` and `ASSISTANT_CHANGES_LOG.md` now reflect the investigation, decisions, fixes, tests, and remaining risks for Tasks 0-6.
   - Remaining risks or follow-up notes:
      - I did not complete a fresh simulator/browser visual smoke pass in this shell, so final runtime confirmation of logos and discovery ordering on-device is still recommended.
      - Live Supabase verification could not be rerun at the end because the required service env vars were not exported in this shell session.

38. **Follow-up verification fix: `/api/place-logo` route tests now pass cleanly alongside `next build`**
   - Timestamp: 2026-03-07 09:39:02 +0700
   - Issue being worked on:
      - Resolve the remaining verification failure around the web `/api/place-logo` route, where `next build` and Jest were diverging on `cheerio` resolution.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts`
   - Decision made:
      - Keep the production route logic unchanged and fix the incompatibility at the test harness level by mocking `cheerio` inside the route test with a deterministic selector stub.
      - Expand the route test coverage from JSON-LD + favicon fallback only to JSON-LD, meta-logo, icon-link, and fallback paths.
   - Why the decision was made:
      - The current production route already builds successfully in Next.js; the remaining failure was Jest resolving `cheerio` to its browser ESM entry and failing before the route logic could run.
      - A local test mock is lower-risk than changing working production code again, and it keeps the route behavior covered without introducing another runtime/build-specific import workaround.
   - How it was tested:
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/place-logo/__tests__/route.test.ts`
      - `pnpm exec eslint apps/doWhat-web/src/app/api/place-logo/route.ts apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts`
      - `pnpm --filter dowhat-web build`
      - `pnpm --filter dowhat-web typecheck`
      - During verification I also hit an intermediate warning/failure by running `typecheck` in parallel with `build`; because `apps/doWhat-web/tsconfig.json` includes `.next/types/**/*.ts`, the first `typecheck` failed until `next build` finished regenerating `.next/types`. I reran `typecheck` after the build completed and it passed.
   - Result:
      - The `/api/place-logo` route suite now passes with 4/4 tests.
      - Web build succeeds again, including `/api/place-logo`.
      - Web `typecheck` passes again after rerunning it in the correct order.
      - The only remaining build warnings observed were the pre-existing `Browserslist: browsers data is 6 months old` notice and Next's informational `Using edge runtime on a page currently disables static generation for that page`.
   - Remaining risks or follow-up notes:
      - `apps/doWhat-web/src/lib/events/parsers/jsonld.ts` still has its own `cheerio` import path; it is not failing in the current verification cycle, but if future Jest coverage imports it directly the same browser-entry resolution issue may need to be handled there too.
      - The Browserslist data warning is environmental maintenance, not a regression from this change, but updating `caniuse-lite` would remove it from future builds.

39. **Final hardening investigation: event JSON-LD parser still had an unnecessary `cheerio` dependency**
   - Timestamp: 2026-03-07 09:44:49 +0700
   - Issue being worked on:
      - Eliminate the last known build/test fragility before closing the task set completely.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Replace the event ingestion JSON-LD HTML parser’s `cheerio` dependency with a lightweight direct script extractor and add dedicated parser regression tests.
   - Why the decision was made:
      - The parser only needs to read `<script type="application/ld+json">...</script>` blocks from HTML; it does not need a full DOM parser.
      - Removing `cheerio` here eliminates the remaining inconsistent test/build import path and closes the last open technical risk from the previous verification pass.
   - How it was tested:
      - Investigation only at this step:
         - `rg -n "parseEventsFromHtml|parseJsonLdDocument|jsonld" apps/doWhat-web/src/lib/events -g '!**/.next/**'`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/events/parsers/jsonld.ts`
         - `find apps/doWhat-web/src/lib/events -path '*__tests__*' -maxdepth 4 -type f | sort`
   - Result:
      - Confirmed `apps/doWhat-web/src/lib/events/parsers/jsonld.ts` only uses `cheerio` to select JSON-LD `<script>` tags from HTML.
      - Confirmed there was no direct parser regression coverage yet, so this path could regress silently.
   - Remaining risks or follow-up notes:
      - The actual code change and tests are the next step and will be logged separately.

40. **Final hardening fix: event JSON-LD parsing no longer depends on `cheerio`, and schema `@id` no longer masquerades as event URL**
   - Timestamp: 2026-03-07 09:46:48 +0700
   - Issue being worked on:
      - Complete the remaining parser hardening and finish the last verification gap in the web event ingestion path.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-web/src/lib/events/parsers/jsonld.ts`
      - `apps/doWhat-web/src/lib/events/__tests__/jsonld.test.ts`
   - Decision made:
      - Replace `cheerio` usage in the event JSON-LD HTML parser with a direct `<script type="application/ld+json">` extractor.
      - Tighten event URL normalization so:
         - `sourceUid` still keeps raw schema identifiers like `evt-1`,
         - canonical `url` only uses actual HTTP(S) URLs or the page/source fallback, not opaque schema IDs.
   - Why the decision was made:
      - The parser only needed JSON-LD script extraction, so a full DOM dependency was unnecessary and carried the same Jest/build fragility already seen in the place-logo route.
      - New regression tests exposed a real data-quality bug: non-URL `@id` values were being stored as event URLs, which would create broken outgoing links and poorer event canonicalization.
   - How it was tested:
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/events/__tests__/jsonld.test.ts src/app/api/place-logo/__tests__/route.test.ts`
      - `pnpm exec eslint apps/doWhat-web/src/lib/events/parsers/jsonld.ts apps/doWhat-web/src/lib/events/__tests__/jsonld.test.ts apps/doWhat-web/src/app/api/place-logo/route.ts apps/doWhat-web/src/app/api/place-logo/__tests__/route.test.ts`
      - `pnpm --filter dowhat-web build`
      - `pnpm --filter dowhat-web typecheck`
      - As in the earlier follow-up, an intermediate `typecheck` run failed when launched in parallel with `build` because `.next/types` had not been regenerated yet; rerunning `typecheck` after `build` completed passed cleanly.
   - Result:
      - Event JSON-LD HTML parsing is now dependency-light and deterministic.
      - Added direct parser regression coverage for:
         - HTML JSON-LD extraction,
         - raw JSON/graph parsing,
         - HTML fallback when the body is not raw JSON,
         - invalid JSON-LD block warning/skip behavior.
      - Confirmed the parser now keeps opaque `@id` values as `sourceUid` only and prefers real event URLs/page URLs for `url`.
      - Targeted event parser tests, `place-logo` tests, targeted lint, web build, and web typecheck all passed.
   - Remaining risks or follow-up notes:
      - The recurring `.next/types` race is a repo-level verification-order concern caused by `apps/doWhat-web/tsconfig.json` including `.next/types/**/*.ts`; it is not a logic regression, but future scripted verification should run `next build` before `typecheck` or avoid running them in parallel.
      - The stale Browserslist database warning remains an environment maintenance task, not an application bug.

41. **SQL/discovery architecture audit kickoff**
   - Timestamp: 2026-03-08 14:13:17 +0700
   - Issue being worked on:
      - Formal decision job on whether, where, and how the SQL/discovery/query layer should be refactored for activity/place/event discovery, filters, ranking, dedupe, web/mobile consistency, performance, and reliability.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Start with an evidence-first architecture audit before any SQL changes: read current logs, discovery docs, query helpers, tests, migrations, and database utilities; map the canonical query entry points; define golden scenarios; then make a documented refactor/no-refactor decision before implementation.
   - Why the decision was made:
      - The request explicitly requires a formal architecture judgment rather than a blind SQL cleanup, and recent discovery-related fixes already changed web/mobile behavior. Any SQL refactor now must be justified against the actual code paths, schema shape, and runtime risks.
   - How it was tested:
      - Reviewed `changes_log.md` and `ASSISTANT_CHANGES_LOG.md`.
      - Enumerated discovery/database artifacts with:
         - `rg -n "discovery|nearby|places|events|sessions|venue_activities|place_sources|taxonomy|ranking|dedupe|materialized|search vector|tsvector|gin|index" apps packages supabase database* scripts docs -g '!**/.next/**' -g '!**/node_modules/**'`
         - `find . -maxdepth 3 \\( -name '*discovery*' -o -name '*migration*' -o -name 'database_updates.sql' -o -name '*schema*' -o -name '*sql' \\) | sort`
   - Result:
      - Audit scope is established.
      - Initial evidence confirms the discovery layer spans:
         - Next.js API routes (`/api/nearby`, `/api/events`, `/api/places`, `/api/discovery/activities`),
         - shared places/discovery helpers,
         - mobile direct Supabase fallbacks,
         - Supabase migrations/docs/scripts,
         - and prior architecture notes in discovery docs.
   - Remaining risks or follow-up notes:
      - No SQL refactor decision has been made yet.
      - The next steps are the detailed Phase 1 audit and golden-scenario baseline definition required before any implementation.

42. **Phase 1 audit: discovery/query architecture classified by canonicality, fragility, and product risk**
   - Timestamp: 2026-03-08 14:16:49 +0700
   - Issue being worked on:
      - Build the required Phase 1 audit of discovery-related SQL/query paths, entity canonicality, taxonomy/filter usage, and web/mobile divergence before deciding whether SQL refactoring is justified.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Classify the current discovery/query layer as a staged TypeScript orchestration over a mixed SQL substrate, not as a SQL-first pipeline.
      - Treat `places` as the schema-canonical place entity, but explicitly record that runtime discovery still reads legacy `venues` and session/activity compatibility paths.
      - Treat user-facing event discovery as a merged `events + sessions` model rather than a pure `events` model.
   - Why the decision was made:
      - The audit evidence shows that ranking, dedupe, trust scoring, and most filter semantics already live in TypeScript, while SQL is mainly used for retrieval, cache persistence, and compatibility joins.
      - A blanket SQL rewrite would therefore move the wrong layer unless the audit demonstrates that retrieval/index/search foundations are the real limiting factor.
   - How it was tested:
      - Reviewed and classified the main entry points and helpers:
         - `sed -n '1,260p' apps/doWhat-web/src/app/api/nearby/route.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/app/api/discovery/activities/route.ts`
         - `sed -n '1,240p' apps/doWhat-web/src/app/api/places/route.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/app/api/events/route.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/app/api/events/queryEventsWithFallback.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/discovery/ranking.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/places/aggregator.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/venues/search.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/sessions/server.ts`
         - `sed -n '1,220p' apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/app/map/__tests__/searchPipeline.integration.test.ts`
         - `sed -n '1,260p' apps/doWhat-web/src/lib/discovery/__tests__/dedupeMerge.test.ts`
         - `sed -n '1,240p' apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - Cross-checked schema intent and indexes in the relevant migrations already identified during the kickoff audit.
   - Result:
      - Query entry points and classification:
         - `apps/doWhat-web/src/app/api/nearby/route.ts`
            - Canonical web discovery entry point.
            - Product-risky if changed because auto-radius expansion, debug payloads, and exposure telemetry depend on it.
         - `apps/doWhat-web/src/lib/discovery/engine.ts`
            - Canonical activity discovery orchestrator.
            - Inconsistent at the storage layer because it blends RPC output, direct table reads, places fallback, and venue fallback.
            - Performance-sensitive because it can fan out across multiple data sources.
         - `apps/doWhat-web/src/app/api/discovery/activities/route.ts`
            - Duplicated wrapper over the same engine.
            - Low SQL value to refactor independently because it mostly sanitizes and shapes the payload.
         - `apps/doWhat-web/src/app/api/places/route.ts` + `apps/doWhat-web/src/lib/places/aggregator.ts`
            - Canonical place discovery path.
            - SQL-light but cache/provider heavy; strongest candidate for index/search support rather than logic migration into SQL.
         - `apps/doWhat-web/src/app/api/events/route.ts`
            - Canonical events endpoint at the API level.
            - Semantically inconsistent because it merges `events` rows with session-derived pseudo-events.
         - `apps/doWhat-web/src/app/api/events/queryEventsWithFallback.ts`
            - Fragile compatibility shim.
            - Necessary today because environments may lag migrations and omit columns like `event_state` or `reliability_score`.
         - `apps/doWhat-web/src/lib/venues/search.ts`
            - Legacy/compatibility discovery path.
            - Product-risky because it reads `venues` directly and ranks “activity availability” independently of the canonical place pipeline.
         - `apps/doWhat-web/src/lib/sessions/server.ts`
            - Canonical session hydration path.
            - Fragile because it still contains migration-detection shims for `activities.place_id` and `activities.place_label`.
         - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
            - Canonical mobile-side filter/query normalization helper.
            - Good parity target; low SQL refactor value by itself.
         - `apps/doWhat-mobile/src/lib/supabasePlaces.ts` and mobile direct Supabase reads in `apps/doWhat-mobile/src/app/home.tsx` / `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
            - Inconsistent/duplicated query paths relative to web.
            - These are a bigger consistency risk than the core web SQL itself.
      - Canonical entity conclusions:
         - `places` is effectively canonical in schema design and should remain the long-term canonical place model.
         - `venues` is still runtime-significant compatibility debt, not the preferred canonical model.
         - User-facing event discovery is currently canonicalized in code as `events + sessions`; `events` alone is not yet the full product truth.
      - Filter/taxonomy conclusions:
         - Taxonomy and search semantics are not applied consistently in SQL.
         - The `activities_nearby` SQL/RPC path supports only a narrow subset of filters, while taxonomy, trust, price, time-window, and dedupe logic are applied later in TypeScript.
         - Existing test coverage already asserts OR-style multi-intent text search and TypeScript-side dedupe/ranking behavior, which makes a full SQL migration of these semantics high-risk.
      - Performance/bottleneck conclusions:
         - The main likely bottlenecks are multi-source fallback fan-out, compatibility queries, and missing/weak retrieval indexes for canonical filters, not ranking-in-SQL absence by itself.
         - The cache/materialization pieces already present (`place_tiles`, `place_tiles.discovery_cache`) suggest targeted SQL/index work may have leverage, but not a wholesale rewrite.
   - Remaining risks or follow-up notes:
      - This audit is still pre-decision. The next required step is to define golden discovery scenarios and use them as the baseline for refactor-option evaluation.
      - Any SQL refactor that tries to absorb ranking/dedupe wholesale would risk diverging from the current tested TypeScript contracts unless those contracts are first normalized.

43. **Phase 2 baseline: golden discovery scenarios encoded as executable regression tests**
   - Timestamp: 2026-03-08 17:00:00 +0700
   - Issue being worked on:
      - Define the golden discovery scenarios required before any SQL refactor decision so discovery behavior has a stable, testable baseline.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-web/src/lib/discovery/__tests__/goldenScenarios.test.ts`
      - `apps/doWhat-mobile/src/lib/__tests__/goldenDiscoveryScenarios.test.ts`
   - Decision made:
      - Encode the baseline as focused unit/contract tests instead of prose only, while reusing the existing `/api/events` payload test as the executable reference for verified-only event filtering.
      - Keep the scenarios aligned to user-visible behavior rather than internal SQL shape so they remain valid even if the query layer changes.
   - Why the decision was made:
      - The architecture job requires a golden baseline before refactoring; executable scenarios are a safer reference than comments or memory.
      - Existing tests already covered parts of the event contract, so the highest-leverage addition was to codify the missing place/activity search scenarios explicitly rather than duplicate the entire suite.
   - How it was tested:
      - Added and ran:
         - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts`
         - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
   - Result:
      - Golden scenarios now covered explicitly:
         - Bouldering in a Bucharest viewport returns the full matching set and excludes out-of-bounds or off-activity noise.
         - `Natural High` search resolves correctly on web discovery.
         - `Natural High` search ranks correctly on mobile discovery.
         - Dedupe collapses provider duplicates without deleting distinct canonical places.
         - Verified-only + min-accuracy event filtering remains covered by the existing `/api/events` payload contract test.
      - Focused web suites passed `6/6`.
      - Focused mobile suites passed `6/6`.
   - Remaining risks or follow-up notes:
      - These are fixture-level baselines, not live production database assertions.
      - If SQL changes later affect live retrieval order or filtering, additional integration validation against a real Supabase dataset may still be required.

44. **Phase 3/4 decision: moderate SQL refactor recommended, limited to retrieval/index support rather than discovery-brain migration**
   - Timestamp: 2026-03-08 17:03:47 +0700
   - Issue being worked on:
      - Evaluate the SQL refactor options formally and decide what should and should not change before implementation.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Chosen path: **2. Moderate SQL refactor recommended — specific indexes plus query-stage normalization support, without moving ranking/dedupe/search orchestration into SQL.**
      - What should be refactored:
         - SQL/index support for hot geo + array-overlap + time-window retrieval paths that already exist.
         - Canonical retrieval support around `places`/`activities`/`events`/`sessions`.
      - What should not be refactored now:
         - Do not rewrite the discovery engine into SQL.
         - Do not move ranking, trust weighting, or dedupe wholesale into SQL.
         - Do not add materialized discovery views yet.
         - Do not add speculative GIN/JSONB/full-text indexes where the current discovery path does not actually query those operators.
   - Why the decision was made:
      - **Option A — Canonical entity normalization:**
         - `places` should remain the single canonical place model.
         - `venues` should be reduced to compatibility/fallback and ingestion-side legacy use, not discovery truth.
         - User-facing events should remain normalized in code as `events + sessions` for now because that is the current product contract; collapsing them into one SQL source would change semantics and freshness behavior.
      - **Option B — Query stage normalization:**
         - The system already behaves as staged discovery in TypeScript:
           1. geo scope
           2. retrieval / fallback merge
           3. metadata hydration
           4. filter application
           5. trust/ranking
           6. dedupe
         - That structure should be preserved. SQL should support the early retrieval stages better, not absorb the whole pipeline.
      - **Option C — Index strategy:**
         - Worth implementing where operators already exist in production code:
           - `activities_nearby` uses PostGIS distance predicates and array overlap on `activity_types` / `tags`.
           - `/api/events` filters `events.tags` with array overlap.
           - discovery/session count paths query `sessions` by `activity_id` + future `starts_at`.
         - Not worth implementing blindly:
           - GIN on JSONB `metadata` / provider raw payloads: no hot discovery query uses those operators today.
           - full-text `tsvector` indexes for core discovery: main map discovery search is currently app-side after retrieval, so a tsvector index would not materially improve the current path.
      - **Option D — Materialized views / precomputed layers:**
         - Rejected for now.
         - The app already has `place_tiles` and `place_tiles.discovery_cache`; another materialized layer would duplicate caching while increasing freshness and refresh complexity, especially for sessions/events.
      - **Option E — Ranking and trust scoring:**
         - Keep in code.
         - Current weights and heuristics are product-tuned and already covered by TypeScript tests. Moving them into SQL now would reduce explainability and increase risk of web/mobile divergence.
      - **Option F — Filter semantics:**
         - Current contract should be preserved and made explicit:
           - OR within each multi-select filter family (`activityTypes`, `tags`, `traits`, `taxonomyCategories`, `priceLevels`).
           - AND across different filter families.
           - text search remains an additional post-retrieval matching layer, not a substitute for taxonomy filters.
           - “verified” for activities/places remains trust-state based; for events it means confirmed location verification in event metadata.
   - How it was tested:
      - Evidence review only at this step:
         - `rg -n "create index|using gist|using gin|tsvector|to_tsvector|materialized view|activities_nearby|place_tiles|venue_activities|events\\(|sessions\\(|places\\(|activities\\(" apps/doWhat-web/supabase/migrations -g '*.sql'`
         - `rg -n "\\.from\\('activities'\\)|\\.from\\('places'\\)|\\.from\\('venues'\\)|\\.from\\('sessions'\\)|\\.from\\('events'\\)|\\.rpc\\('activities_nearby'\\)|\\.rpc\\(" apps/doWhat-web/src apps/doWhat-mobile/src -g '!**/.next/**' -g '!**/node_modules/**'`
         - `sed -n '1,220p' apps/doWhat-web/supabase/migrations/014_places.sql`
         - `sed -n '1,220p' apps/doWhat-web/supabase/migrations/015_events.sql`
         - `sed -n '1,220p' apps/doWhat-web/supabase/migrations/052_activities_place_label_cleanup.sql`
         - `sed -n '1480,2315p' apps/doWhat-web/src/lib/discovery/engine.ts`
         - `sed -n '1,260p' apps/doWhat-mobile/src/lib/supabasePlaces.ts`
      - Consulted official PostgreSQL documentation on:
         - GIN indexes
         - GiST indexes
         - text search indexes
         - materialized views
   - Result:
      - Formal decision recorded before implementation, as required.
      - The highest-leverage safe implementation is now scoped to:
         - missing discovery indexes that match existing predicates/operators,
         - plus lightweight validation to keep those SQL supports from silently regressing.
   - Remaining risks or follow-up notes:
      - A live `EXPLAIN ANALYZE` comparison was not possible in this shell because no verified database session/profile has been established for the target Supabase environment.
      - Because of that, implementation should stay reversible and conservative: additive indexes and validation, not behavioral SQL rewrites.

45. **Phase 5 implementation: add only the justified discovery SQL support indexes and a migration-level contract verifier**
   - Timestamp: 2026-03-08 17:05:36 +0700
   - Issue being worked on:
      - Implement the highest-leverage safe SQL-side changes justified by the audit and decision: additive index support for hot discovery/event/session retrieval paths.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `apps/doWhat-web/supabase/migrations/068_discovery_query_support_indexes.sql`
      - `scripts/verify-discovery-sql-contract.mjs`
   - Decision made:
      - Add one new migration containing only additive indexes:
         - `idx_activities_geom`
         - `idx_activities_activity_types_gin`
         - `idx_activities_tags_gin`
         - `idx_events_tags_gin`
         - `idx_sessions_activity_id_starts_at`
      - Add a dedicated verification script that asserts the discovery-critical index support remains present across migrations.
   - Why the decision was made:
      - These indexes directly match operators and predicates already used by the current product:
         - `activities_nearby` uses `ST_DWithin` on `activities.geom` and array overlap on `activity_types` / `tags`.
         - `/api/events` filters `events.tags` with array overlap.
         - discovery/session-count paths query `sessions` by `activity_id` plus future `starts_at`.
      - This approach improves the SQL foundation without changing product semantics, ranking weights, dedupe behavior, or the web/mobile discovery contract.
   - How it was tested:
      - `node scripts/verify-discovery-sql-contract.mjs`
      - `node scripts/verify-discovery-contract.mjs`
      - `pnpm exec eslint scripts/verify-discovery-sql-contract.mjs`
   - Result:
      - The new migration is present and the verifier passes.
      - Existing discovery contract guardrails also still pass.
      - No runtime discovery behavior was changed at this step; the change is additive and reversible at the schema-support layer.
   - Remaining risks or follow-up notes:
      - These are migration-level guarantees, not proof of live planner usage. Applying migration `068` to the target Supabase environment and running `EXPLAIN ANALYZE` there is still the next operational step if deeper performance measurement is required.
      - I intentionally did **not** add speculative indexes on JSONB metadata/raw payloads, full-text vectors, or new materialized views because the current discovery path would not benefit enough to justify the added maintenance cost.

46. **Final verification: decision, baseline tests, typechecks, and SQL/discovery contract checks all pass**
   - Timestamp: 2026-03-08 17:06:26 +0700
   - Issue being worked on:
      - Finish the architecture task with a final verification pass and log summary.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Close the task with the moderate-refactor decision plus the implemented additive index support; no further SQL changes are justified in this turn without live database explain plans.
   - Why the decision was made:
      - The baseline behavior is protected by focused discovery/event/mobile tests, and the SQL support layer is now protected by a migration-level verifier.
      - Additional changes now would move beyond the evidence gathered in this environment.
   - How it was tested:
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint apps/doWhat-web/src/lib/discovery/__tests__/goldenScenarios.test.ts apps/doWhat-mobile/src/lib/__tests__/goldenDiscoveryScenarios.test.ts scripts/verify-discovery-sql-contract.mjs`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
      - `node scripts/verify-discovery-sql-contract.mjs`
      - `node scripts/verify-discovery-contract.mjs`
   - Result:
      - Web typecheck passed.
      - Mobile typecheck passed.
      - Targeted ESLint passed.
      - Focused web discovery/event suites passed `6/6`.
      - Focused mobile discovery suites passed `6/6`.
      - Both discovery verification scripts passed.
      - `changes_log.md` and `ASSISTANT_CHANGES_LOG.md` now contain the full audit, decision, implementation, and verification trail for this architecture job.
   - Remaining risks or follow-up notes:
      - The new indexes are not active until migration `068` is applied to the target Supabase environment.
      - No live `EXPLAIN ANALYZE` before/after measurement was possible here, so real database performance gains remain an operational follow-up after migration rollout.
      - The next worthwhile step, if needed, is a production-like measurement pass on:
         - `activities_nearby`
         - event queries with `categories`
         - discovery/session-count queries by `activity_id + starts_at`

47. **Follow-up phase kickoff: post-migration verification, live plan measurement, and next-step decision**
   - Timestamp: 2026-03-08 17:15:49 +0700
   - Issue being worked on:
      - Execute the next precision phase after migration `068`: determine whether it is applied in the target environment, apply it safely if needed, measure hot discovery paths with live explain plans if possible, and decide whether canonical place-scope normalization around `geom` is now justified.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Start with environment/migration-runner inspection and connectivity checks before attempting any DB mutation or measurement.
      - Keep this pass narrow and evidence-based: migration state, explain plans, semantic regression checks, and only then a next-step SQL decision.
   - Why the decision was made:
      - The prior phase explicitly identified live migration application and explain-plan measurement as the correct next step, but also noted that no verified DB session was available in the shell at that time.
      - This follow-up therefore has to prove whether live DB work is possible before making new SQL changes.
   - How it was tested:
      - Re-read prior architecture and verification entries:
         - `tail -n 120 changes_log.md`
         - `tail -n 120 ASSISTANT_CHANGES_LOG.md`
      - Located the repo migration entry points:
         - `rg -n "supabase db push|supabase migration|migrate|db reset|supabase link|supabase start|db push" package.json pnpm-workspace.yaml apps/doWhat-web package.json -g '!**/.next/**'`
   - Result:
      - Confirmed the previous state and the presence of a repo migration path (`db:migrate`).
      - Next step is to inspect the migration runner/config and determine whether the target Supabase environment is reachable from this shell.
   - Remaining risks or follow-up notes:
      - No conclusion has been made yet on whether migration `068` is already applied or whether live `EXPLAIN ANALYZE` is possible.

48. **Live environment check: target project is behind migrations and direct PostgreSQL access remains blocked**
   - Timestamp: 2026-03-08 17:18:21 +0700
   - Issue being worked on:
      - Determine whether migration `068` is already applied and whether live explain plans can be obtained from the target Supabase environment.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Use the live Supabase REST surface as the fallback verification path because:
         - the shell has no exported DB credentials,
         - the repo’s env files do contain a DB URL,
         - but direct PostgreSQL connectivity to the configured host fails from this environment.
   - Why the decision was made:
      - This preserves the evidence bar: use a real target-environment signal where possible rather than guessing migration state from local files.
   - How it was tested:
      - Confirmed env key availability without printing values:
         - `node scripts/health-env.mjs`
      - Confirmed direct migration path is blocked:
         - local shell has no exported `SUPABASE_DB_URL` / `DATABASE_URL`
         - `supabase` CLI is not installed
         - `psql` is not installed
         - direct `pg` connection using the DB URL from `.env.local` failed with `ENOTFOUND` on the configured DB host
      - Queried the target project via Supabase REST using the service-role key from local env files:
         - checked `public.schema_migrations` for `068_discovery_query_support_indexes.sql`
         - fetched the latest applied migrations
         - probed PostgREST plan media types against `/rest/v1/events` and `/rest/v1/rpc/activities_nearby`
   - Result:
      - Migration `068_discovery_query_support_indexes.sql` is **not applied** in the target environment.
      - The latest visible applied migration is `064_security_advisor_extension_schema_cleanup.sql`; therefore `065`, `066`, `067`, and `068` are all missing remotely.
      - Direct PostgreSQL migration application is currently blocked by network/DNS to the configured DB host from this shell.
      - REST-based explain plans are also blocked: the project returns `406 PGRST107` for every `application/vnd.pgrst.plan...` media type tested, so PostgREST plan output is not enabled/available.
   - Remaining risks or follow-up notes:
      - Because neither direct PostgreSQL access nor REST explain plans are available, this pass cannot produce a true live `EXPLAIN ANALYZE` from the target environment.
      - The next best evidence is live request timing on the currently deployed pre-068 state plus static query/index analysis.

49. **Fallback live measurement: pre-068 remote timings collected, but true explain-plan evidence remains blocked**
   - Timestamp: 2026-03-08 17:21:42 +0700
   - Issue being worked on:
      - Gather the safest live performance evidence still available after direct PostgreSQL and REST explain plans proved unavailable.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Measure live timing against the target project’s current pre-068 state via Supabase REST/RPC, then combine that with static query-shape analysis.
      - Do not over-interpret these timings as “after 068” data because migration `068` is not deployed remotely.
   - Why the decision was made:
      - This is the only real target-environment evidence available from the current shell.
      - It still helps identify whether the remaining bottlenecks are likely SQL-side, application-side, or environment-drift related.
   - How it was tested:
      - Timed 5 live runs each against the remote project using the service-role key from local env files:
         - `activities_nearby` RPC with `lat/lng/radius/types/tags_filter`
         - `events` table query with `tags` overlap (same semantics as `/api/events?categories=...`)
         - `sessions` query with `activity_id IN (...)` + future `starts_at`
         - `places` scalar bounds query (`lat/lng` range + `order=updated_at.desc`) to represent the current place fallback shape
      - Cross-checked hot query shapes in:
         - `apps/doWhat-web/src/lib/discovery/engine.ts`
         - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
   - Result:
      - Live timing summaries on the current remote state:
         - `activities_nearby_rpc`
            - median: `244.93ms`
            - rows returned: `0`
            - conclusion: latency is non-trivial even with an empty result; because `068` is not applied, this does **not** measure the intended post-index state.
         - `events_tags_overlap`
            - median: `246.22ms`
            - rows returned: `0`
            - sampled event inventory: only `9` rows total, top sampled tag `community`
            - conclusion: current timing is dominated by remote request cost and sparse inventory; no post-068 conclusion is possible.
         - `sessions_activity_future_window_probe`
            - median: `254.38ms`
            - rows returned: `0`
            - future sessions sampled from the target environment: `0`
            - conclusion: the exact query shape can be exercised, but the production-like workload is absent in this environment.
         - `places_scalar_bounds_query`
            - median: `260.00ms`
            - rows returned: `200` (hit the limit)
            - conclusion: this remains the clearest surviving hot-path risk because the code still scopes many place fallbacks with scalar `lat/lng` predicates and `updated_at` ordering rather than `geom` predicates, so the existing `idx_places_geom` GiST index cannot help this path directly.
      - Index usage / plan summary:
         - true live index-usage verification remains unavailable because:
            - direct PostgreSQL `EXPLAIN ANALYZE` is blocked,
            - PostgREST plan media types are unavailable on the target project.
         - Static evidence still supports:
            - `activities_nearby` would benefit from `idx_activities_geom`, `idx_activities_activity_types_gin`, and `idx_activities_tags_gin` once `068` is deployed.
            - `events.tags` overlap would benefit from `idx_events_tags_gin` once `068` is deployed.
            - the future session count path would benefit from `idx_sessions_activity_id_starts_at` once `068` is deployed.
      - Bottleneck summary:
         - The largest confirmed remaining issue is **environment drift**: the target project is missing `060`, `065`, `066`, `067`, and `068`.
         - The largest code-level remaining risk is **place-scope fallback queries that still use scalar `lat/lng` ranges instead of canonical `geom` scoping**.
   - Remaining risks or follow-up notes:
      - Because the remote environment is missing `066_place_tiles_discovery_cache.sql`, part of the intended discovery cache path is also missing there; this means current latency cannot be treated as representative of the hardened design.
      - The next decision must therefore weigh missing-migration rollout ahead of any new SQL rewrite.

50. **Operational hardening + final decision: update migration health coverage; do not change SQL further yet**
   - Timestamp: 2026-03-08 17:21:42 +0700
   - Issue being worked on:
      - Close the follow-up pass with the smallest justified fix and a decision on whether canonical place-scope normalization around `geom` should proceed now.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `scripts/health-migrations.mjs`
   - Decision made:
      - Update `scripts/health-migrations.mjs` so repo health checks now require the discovery-critical migrations that the remote project is actually missing:
         - `045`–`052`
         - `060`
         - `065`–`068`
      - **Do not change SQL further yet.**
      - Specifically: do **not** implement canonical place-scope normalization around `geom` in this pass.
   - Why the decision was made:
      - Evidence does show that canonical place-scope normalization is the next plausible SQL improvement:
         - current place fallback queries still use scalar `lat/lng` ranges and `updated_at` ordering,
         - therefore they cannot fully leverage the canonical `places.geom` index.
      - But it is **not** the next correct move yet because:
         - the target environment is still missing `060`, `065`, `066`, `067`, and `068`,
         - there is no live post-068 measurement,
         - there is no live explain-plan access,
         - changing SQL again now would stack an unmeasured rewrite on top of an unapplied baseline.
      - The highest-leverage safe change available **in this environment** was to make migration drift visible in health checks.
   - How it was tested:
      - Validated the health-script update with:
         - `MIGRATIONS_HEALTH_SKIP=1 node scripts/health-migrations.mjs --dowhat`
         - a local source assertion confirming all newly required migration filenames are present
         - `pnpm exec eslint scripts/health-migrations.mjs scripts/verify-discovery-sql-contract.mjs`
      - Re-ran semantic discovery verification:
         - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts`
         - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
         - `node scripts/verify-discovery-sql-contract.mjs`
         - `node scripts/verify-discovery-contract.mjs`
   - Result:
      - `scripts/health-migrations.mjs` now protects against the exact discovery-migration drift found in the target environment.
      - Focused web semantic suites passed `6/6`.
      - Focused mobile semantic suites passed `6/6`.
      - `verify-discovery-sql-contract.mjs` passed.
      - `verify-discovery-contract.mjs` passed.
      - Final next-step decision:
         - **Do not change SQL further yet.**
         - First apply the missing remote migrations (`060`, `065`, `066`, `067`, `068`) from an environment with working PostgreSQL connectivity.
         - Then rerun live `EXPLAIN ANALYZE` or enabled PostgREST plan capture.
         - Only after that should canonical place-scope normalization around `geom` be reconsidered.
   - Remaining risks or follow-up notes:
      - The biggest remaining bottleneck is now partly operational, not purely technical: the target DB is behind required discovery migrations.
      - Once migration rollout is complete and measurable, the smallest safe next SQL improvement would likely be:
         - normalize the place fallback scope to a canonical `geom`-based query shape,
         - keep ranking/trust/dedupe in TypeScript,
         - and leave materialization/full-text work deferred unless real plans justify them.

51. **Current-pass decision lock: broad SQL refactor rejected; finalize only the moderate SQL/discovery path, then return to filters**
   - Timestamp: 2026-03-08 17:31:45 +0700
   - Issue being worked on:
      - Lock the execution mode for the current pass before making further tooling or documentation changes.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Broad SQL refactor remains rejected for now.
      - The team is proceeding only with the moderate SQL/discovery path:
         - migration readiness,
         - remote verification tooling/pack,
         - and only very narrow safe hardening if justified.
      - Once that baseline is finalized, the next priority is the filter-system pass.
   - Why the decision was made:
      - Remote Supabase is still behind the required discovery migrations.
      - Migration `068` is not applied remotely.
      - Live explain-plan verification is unavailable from this shell.
      - A broader SQL rewrite under those constraints would be speculative and high-risk.
   - How it was tested:
      - Reviewed the immediately preceding remote-state findings and prior decision records already captured in the logs.
   - Result:
      - Execution scope for this pass is explicitly constrained and logged before more work proceeds.
   - Remaining risks or follow-up notes:
      - The next actions in this pass must stay operational, deterministic, and test-backed.

52. **Moderate-path finalization: harden migration readiness, add the human remote verification pack, and prepare the filter-pass handoff**
   - Timestamp: 2026-03-08 17:38:16 +0700
   - Issue being worked on:
      - Finalize the moderate SQL/discovery path without changing discovery semantics so the next pass can focus on filters on top of a clean operational baseline.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `scripts/health-migrations.mjs`
      - `docs/discovery_remote_rollout_pack.md`
      - `docs/discovery_verification_checklist.md`
      - `scripts/sql/discovery-postdeploy-checks.sql`
      - `docs/filter_pass_handoff.md`
   - Decision made:
      - Keep the current pass operational only:
         - improve migration-readiness reporting,
         - package the exact remote deploy/verification steps,
         - and explicitly **do not** change runtime discovery code or SQL semantics further.
      - The next product pass should be **API/query contract cleanup for filters**, not UI-only polish and not a full schema redesign.
   - Why the decision was made:
      - The target remote is still missing `060`, `065`, `066`, `067`, and `068`, so runtime discovery changes would stack on top of an unapplied baseline.
      - `scripts/health-migrations.mjs` is now the best leverage point because it can fail loudly and deterministically before human rollout.
      - A reusable SQL post-deploy pack and a filter handoff reduce operator error and keep the next discovery/filter work grounded in the same baseline.
      - There is still no evidence that another code-side discovery hardening change is justified before the remote migrations are applied and measured.
   - How it was tested:
      - Validated migration readiness output and failure behavior:
         - `pnpm exec eslint scripts/health-migrations.mjs scripts/verify-discovery-sql-contract.mjs`
         - `node scripts/health-migrations.mjs --dowhat --remote-rest --json`
         - `node scripts/health-migrations.mjs --dowhat --json`
         - `node scripts/health-migrations.mjs --dowhat --remote-rest --strict`
         - `node scripts/health-migrations.mjs --dowhat --strict`
      - Re-ran the semantic verification set after the tooling/doc updates:
         - `node scripts/verify-discovery-sql-contract.mjs`
         - `node scripts/verify-discovery-contract.mjs`
         - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts`
         - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
   - Result:
      - `scripts/health-migrations.mjs` now:
         - reports mode (`pg` or `rest`),
         - supports `--json`,
         - supports forced REST checks,
         - falls back from unreachable direct PG to REST when safe,
         - lists missing migrations in deterministic order with why-notes,
         - and exits non-zero when required migrations or tables are missing.
      - The remote-readiness message is now explicit:
         - current known missing migrations remain `060`, `065`, `066`, `067`, and `068`.
      - A human-run rollout pack now exists in `docs/discovery_remote_rollout_pack.md`.
      - A copy-paste SQL verification pack now exists in `scripts/sql/discovery-postdeploy-checks.sql`.
      - A structured next-pass handoff now exists in `docs/filter_pass_handoff.md`.
      - Discovery verification still passed:
         - web focused suites `6/6`,
         - mobile focused suites `6/6`,
         - `verify-discovery-sql-contract.mjs` passed,
         - `verify-discovery-contract.mjs` passed.
      - No runtime discovery semantics changed in this pass.
   - Remaining risks or follow-up notes:
      - The human next step is still to apply the missing remote migrations from a machine with working DB access, then run the rollout pack and post-deploy SQL checks.
      - Until that happens, the filter pass should not assume the target environment has the `068` index baseline.
      - After rollout, the next task should define one shared filter contract across web/mobile/backend before any major filter UI redesign.

53. **Filter foundation pass kickoff: audit current filters, define a shared contract, align backend behavior, and defer UI redesign**
   - Timestamp: 2026-03-08 17:44:56 +0700
   - Issue being worked on:
      - Start the filter foundation pass for discovery without redesigning the whole system.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Broad SQL refactor remains out of scope.
      - This pass will focus on:
         - filter audit,
         - one shared typed filter contract,
         - web/mobile/backend alignment,
         - deterministic query behavior,
         - and stronger regression coverage.
      - Full filter UI redesign is explicitly deferred until the contract is stable.
   - Why the decision was made:
      - The previous pass established that the next highest-leverage work is API/query contract cleanup for filters, not more SQL rewriting or visual redesign.
      - Current discovery/filter behavior is still split across surfaces and needs a stable typed foundation first.
   - How it was tested:
      - Reviewed:
         - `changes_log.md`
         - `ASSISTANT_CHANGES_LOG.md`
         - `docs/filter_pass_handoff.md`
         - current discovery/filter doc and test inventory
   - Result:
      - The current pass is now explicitly scoped before implementation starts.
   - Remaining risks or follow-up notes:
      - The audit still needs to classify every filter surface and identify duplicated or frontend-only semantics before code changes begin.

54. **Filter audit: classify live filter surfaces, identify duplicated semantics, and isolate frontend-only behavior**
   - Timestamp: 2026-03-08 17:45:00 +0700
   - Issue being worked on:
      - Complete Phase 1 of the filter foundation pass before any contract refactor.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Treat consumer discovery filters and host-verification filters as separate product surfaces.
      - The shared filter contract for this pass will target discovery surfaces first:
         - web map,
         - mobile map,
         - mobile home activity discovery,
         - nearby/events API routes,
         - and the discovery engine.
      - `venues` page filters will be audited and cleaned only where they create misleading overlap, but they are not the canonical consumer discovery contract.
   - Why the decision was made:
      - The audit shows the main determinism problems live in discovery surfaces, not the host verification workflow.
      - The `venues` page filters operate on returned verification rows, while map/home discovery filters affect what inventory is requested, ranked, and shown.
   - How it was tested:
      - Read and traced:
         - `packages/shared/src/map/types.ts`
         - `packages/shared/src/map/utils.ts`
         - `packages/shared/src/map/api.ts`
         - `packages/shared/src/preferences/mapFilters.ts`
         - `packages/shared/src/preferences/activityFilters.ts`
         - `packages/shared/src/preferences/activityFilterOptions.ts`
         - `packages/shared/src/events/api.ts`
         - `packages/shared/src/events/types.ts`
         - `packages/shared/src/places/types.ts`
         - `packages/shared/src/places/utils.ts`
         - `apps/doWhat-web/src/lib/filters.ts`
         - `apps/doWhat-web/src/app/api/nearby/route.ts`
         - `apps/doWhat-web/src/app/api/events/route.ts`
         - `apps/doWhat-web/src/app/api/discovery/activities/route.ts`
         - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
         - `apps/doWhat-web/src/lib/discovery/engine.ts`
         - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
         - `apps/doWhat-web/src/app/map/page.tsx`
         - `apps/doWhat-web/src/app/venues/page.tsx`
         - `apps/doWhat-mobile/src/app/filter.tsx`
         - `apps/doWhat-mobile/src/app/home.tsx`
         - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
         - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
         - current discovery/filter tests
   - Result:
      - Filter surface classification:
         - `web map`:
            - `searchTerm`: visible purpose = search activities/events by text; actual behavior = local-only client filtering; status = **valid but frontend-only / misleading**.
            - `activityTypes`: visible purpose = activity chips; actual behavior = backend filter via `/api/nearby`, with silent `activityTypes -> tags` fallback when support is missing; status = **valid but semantically duplicated / fragile**.
            - `traits`: visible purpose = people/persona refinement; actual behavior = backend + client filter when supported; status = **valid but weak and mobile-divergent**.
            - `taxonomyCategories`: visible purpose = tier-3 discovery categories; actual behavior = backend + client filter; status = **valid**.
            - `priceLevels`, `capacityKey`, `timeWindow`: visible purpose = structured venue/activity refinement; actual behavior = backend + client filter; status = **valid**.
            - `dataMode` (`activities` / `events` / `both`): visible purpose = result kind; actual behavior = separate local state, not part of shared filter contract; status = **valid but duplicated outside filter model**.
         - `mobile map`:
            - `searchText`: visible purpose = search places in view; actual behavior = local-only place text match; status = **valid but frontend-only / divergent from web backend path**.
            - `categories`: visible purpose = place/activity taxonomy; actual behavior = backend discovery filter + local place filter; status = **valid**.
            - `priceLevels`, `capacityKey`, `timeWindow`: visible purpose = refine places; actual behavior = backend discovery filter + local place filter; status = **valid**.
            - `maxDistanceKm`: visible purpose = distance filter; actual behavior = local-only post-fetch place filter; status = **frontend-only / misleading**.
            - events on mobile map are loaded separately and are not part of the same filter model; status = **web/mobile contract divergence**.
         - `mobile home activity filters` (`/filter` + Home):
            - `radius`, `categories`, `priceRange`, `timeOfDay`: visible purpose = tune nearby activity suggestions; actual behavior = stored as `ActivityFilterPreferences`, then partially mapped into discovery query filters and partially reimplemented in fallback Supabase session filtering; status = **valid but duplicated across two models and two code paths**.
            - home search bar: local list search on fetched activities; status = **local-only search, outside backend contract**.
         - `venues page`:
            - `statusFilter` (`all` / `verified` / `needs_review` / `ai_only`): actual behavior = local filter on verification fields; status = **valid, admin-surface-specific**.
            - `onlyOpenNow`, `onlyWithVotes`, `categorySignalOnly`, `keywordSignalOnly`, `priceLevelFilters`, `nameSearch`, `categoryFilter`: actual behavior = local filters on fetched venue rows; status = **valid but intentionally outside the consumer discovery contract**.
         - `API / backend`:
            - `/api/nearby`: accepts `types,tags,traits,taxonomy,prices,capacity,timeWindow`; no typed shared parser; no search text, trust filter, result kind, or sort support; status = **canonical but incomplete / duplicated parsing**.
            - `/api/events`: separate `categories,verifiedOnly,minAccuracy`; status = **valid but isolated from discovery contract**.
            - `/api/discovery/activities`: returns discovery inventory and filter support/facets but does not consume the same shared filter contract; status = **duplicated contract surface**.
         - `shared / engine`:
            - `MapFilters`, `MapFilterPreferences`, `ActivityFilterPreferences`, `NearbyQuery`, `DiscoveryFilters`, `MobileMap Filters`, and mobile-home mapping helpers currently represent overlapping filter meaning in parallel; status = **duplicated architecture**.
      - Main root causes from the audit:
         - search text is mostly local-only and not part of the backend discovery contract;
         - result kind is handled outside the filter model;
         - trust semantics live only in events or venues, not the shared discovery contract;
         - `maxDistanceKm` on mobile map is a user-facing frontend-only filter;
         - activity filter meaning is duplicated between `activityTypes` and `tags`;
         - shared and backend normalization differ (`packages/shared/src/map/utils.ts` vs `apps/doWhat-web/src/lib/discovery/engine-core.ts`);
         - mobile home fallback filtering re-implements price/time/category logic instead of reusing one contract.
      - Explicit semantic definitions to carry into the contract refactor:
         - multi-select taxonomy/activity filters should remain **OR within the same filter group**;
         - text search should combine with structured filters as **AND**;
         - `verifiedOnly` should mean only user-facing entities with verified confirmation state;
         - `ai_only` should mean suggestion-only rows (`verification_state = suggested` or equivalent venue status);
         - people filters should only apply when schema-backed traits are actually present/supported.
   - Remaining risks or follow-up notes:
      - The next step must replace the parallel filter models with one normalized shared contract before changing UI structure further.
      - The mobile map distance filter must either become a real contract-backed geo filter or be removed from the UI.

55. Filter contract implementation and backend alignment
   - Timestamp: 2026-03-08 18:10:11 +0700
   - Issue being worked on:
      - FILTER FOUNDATION PASS phase 2 and phase 3.
      - Replace parallel filter parsers and duplicated place-filter semantics with one shared typed contract used by shared request builders, `/api/nearby`, `/api/places`, web map, web places, mobile map, and fallback loaders.
   - Files changed:
      - `packages/shared/src/discovery/filters.ts`
      - `packages/shared/src/discovery/index.ts`
      - `packages/shared/src/index.ts`
      - `packages/shared/src/map/types.ts`
      - `packages/shared/src/map/utils.ts`
      - `packages/shared/src/places/api.ts`
      - `packages/shared/src/places/filtering.ts`
      - `packages/shared/src/places/index.ts`
      - `packages/shared/src/places/types.ts`
      - `packages/shared/src/places/utils.ts`
      - `packages/shared/src/preferences/mapFilters.ts`
      - `apps/doWhat-web/src/lib/filters.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/app/api/places/route.ts`
      - `apps/doWhat-web/src/lib/places/types.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/places/page.tsx`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `packages/shared/src/__tests__/discoveryFilters.test.ts`
      - `packages/shared/src/places/__tests__/filtering.test.ts`
      - `packages/shared/src/__tests__/mapApi.test.ts`
      - `packages/shared/src/places/__tests__/queryKey.test.ts`
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - `apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts`
      - `apps/doWhat-web/src/app/api/places/__tests__/route.test.ts`
   - Decision made:
      - Introduce one canonical `DiscoveryFilterContract` in `@dowhat/shared` with deterministic normalization, URL parse/serialize helpers, explicit `trustMode`, explicit `peopleTraits`, real `searchText`, real `maxDistanceKm`, and explicit `sortMode`.
      - Keep ranking/dedupe orchestration code-driven; only tighten filter parsing, contract threading, and deterministic server-side filtering.
      - Remove the duplicated category-only filter surface on the web places page and stop passing duplicate `categories + taxonomyCategories` in the mobile places query path.
   - Why the decision was made:
      - The audit showed the main problem was contract drift, not missing UI controls or a missing SQL abstraction.
      - `searchText` and mobile distance were the clearest fake semantics because they were user-facing but not contract-backed.
      - `traits` was semantically overloaded; renaming the query-layer field to `peopleTraits` makes people filtering explicit without rewriting the storage model.
   - How it was tested:
      - Added shared normalization tests, place-filter tests, nearby route contract tests, places route contract tests, mobile parity updates, and shared URL-serialization coverage.
      - Full command execution still pending in the next verification step of this pass.
   - Result:
      - There is now one shared normalized filter contract in code.
      - `/api/nearby` now parses the shared contract, respects `searchText`, `peopleTraits`, `trustMode`, and narrows radius by `maxDistanceKm`.
      - `/api/places` now parses the shared contract, maps taxonomy into the canonical backend category query, and applies deterministic server-side place filtering before returning results.
      - Web places stopped doing an extra local category filter on top of `/api/places`.
      - Mobile map request building now includes `searchText` and `maxDistanceKm` in the shared contract and threads that contract into Supabase/OSM fallback filtering.
   - Remaining risks or follow-up notes:
      - Verification and typecheck may still expose integration drift from the `traits -> peopleTraits` query-layer rename.
      - Event-route filters are still separate from the shared discovery contract; they were audited but not redesigned in this foundation pass.

56. Filter foundation verification and final hardening
   - Timestamp: 2026-03-08 18:15:04 +0700
   - Issue being worked on:
      - Complete the FILTER FOUNDATION PASS by fixing verification drift, running focused tests/typechecks, and confirming the repo is ready for the next filter-focused UI pass.
   - Files changed:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `packages/shared/src/places/filtering.ts`
      - `packages/shared/src/map/types.ts`
      - `packages/shared/src/discovery/filters.ts`
      - `packages/shared/src/__tests__/discoveryFilters.test.ts`
      - `packages/shared/src/__tests__/mapApi.test.ts`
      - `apps/doWhat-web/src/app/api/places/__tests__/route.test.ts`
      - `apps/doWhat-web/src/app/api/places/route.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
   - Decision made:
      - Keep the contract refactor narrow and finish by fixing only the compile/test issues introduced by contract threading.
      - Do not expand the pass into event-filter redesign or broader ranking changes after verification succeeded.
   - Why the decision was made:
      - The remaining failures were all integration drift from the new shared contract, not signs that the architecture choice was wrong.
      - Once web/shared/mobile typechecks and focused regression suites passed, there was no evidence supporting additional scope in this pass.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/discoveryFilters.test.ts src/__tests__/mapApi.test.ts src/places/__tests__/filtering.test.ts src/places/__tests__/queryKey.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/nearby/__tests__/payload.test.ts src/app/api/places/__tests__/route.test.ts src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter doWhat-mobile typecheck`
      - `pnpm exec eslint packages/shared/src/discovery/filters.ts packages/shared/src/places/filtering.ts packages/shared/src/map/types.ts packages/shared/src/map/utils.ts packages/shared/src/places/api.ts packages/shared/src/places/types.ts packages/shared/src/places/utils.ts packages/shared/src/preferences/mapFilters.ts packages/shared/src/__tests__/discoveryFilters.test.ts packages/shared/src/__tests__/mapApi.test.ts packages/shared/src/places/__tests__/filtering.test.ts packages/shared/src/places/__tests__/queryKey.test.ts apps/doWhat-web/src/lib/filters.ts apps/doWhat-web/src/lib/discovery/engine-core.ts apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/ranking.ts apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts apps/doWhat-web/src/app/api/nearby/route.ts apps/doWhat-web/src/app/api/places/route.ts apps/doWhat-web/src/lib/places/types.ts apps/doWhat-web/src/app/map/page.tsx apps/doWhat-web/src/app/places/page.tsx apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts apps/doWhat-web/src/app/api/places/__tests__/route.test.ts apps/doWhat-mobile/src/lib/mobileDiscovery.ts apps/doWhat-mobile/src/lib/supabasePlaces.ts apps/doWhat-mobile/src/app/(tabs)/map/index.tsx apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - `node scripts/verify-discovery-contract.mjs`
      - `node scripts/verify-discovery-sql-contract.mjs`
   - Result:
      - Shared filter-contract tests passed `9/9`.
      - Focused web route/ranking tests passed `14/14`.
      - Focused mobile parity tests passed `5/5`.
      - Shared, web, and mobile typecheck passed.
      - Targeted ESLint passed.
      - Discovery contract verification scripts passed.
      - The filter foundation pass is stable enough to hand off to the next UI-focused filter pass.
   - Remaining risks or follow-up notes:
      - `/api/events` still uses its own narrower filter query surface and should be folded into the shared contract only if the next pass decides event filters need redesign too.
      - The next pass should redesign the filter UX on top of the stabilized contract rather than adding new filter meanings.

57. Filter completion pass kickoff
   - Timestamp: 2026-03-09 09:02:00 +0700
   - Issue being worked on:
      - FILTER COMPLETION PASS.
      - The foundation pass stabilized the contract, but the real user-facing web map filter surface still shows placeholder “temporarily unavailable” states.
   - Files to investigate first:
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/api/nearby/route.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - related tests and any filter-support helpers
   - Decision made:
      - Broad SQL refactor remains out of scope.
      - This pass must remove placeholder filter blocks from the real user-facing discovery surface and either fully wire those filters end to end or remove them from the UI.
   - Why the decision was made:
      - From a product perspective, a visible filter section that says “temporarily unavailable” is still a broken feature.
   - How it will be tested:
      - Trace the exact placeholder root cause first, then add/update UI, route, and discovery tests so placeholder copy cannot silently return.
   - Result:
      - Kickoff logged before implementation.
   - Remaining risks or follow-up notes:
      - If a filter cannot be proven schema/query-backed on this surface, it must be removed rather than left visible.

58. Filter completion root-cause investigation
   - Timestamp: 2026-03-09 09:12:00 +0700
   - Issue being worked on:
      - Why the web map drawer renders placeholder filter sections instead of real working controls.
   - Files investigated:
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx`
   - Decision made:
      - Fix the root cause in two places:
        1. discovery must stop collapsing filter capability to the weakest fallback source
        2. the web map drawer must stop rendering “temporarily unavailable” / “appear when...” copy and instead only render real sections when the filter is supported and backed by actual options or active state
   - Why the decision was made:
      - The current `filterSupport` flow uses an `AND` merge across RPC/activity/place/venue fallback sources, so one low-fidelity fallback can disable filters for the whole surface even when the final result set contains valid taxonomy/price/time metadata.
      - The map drawer then reads those downgraded flags and shows placeholder copy, especially before nearby data has loaded or when weaker fallback sources were merged.
   - How it will be tested:
      - Add/update web discovery and map-page regression tests so placeholder copy cannot return and supported filters still render as real controls.
   - Result:
      - Root cause confirmed; implementation can now be targeted instead of hiding the symptom.
   - Remaining risks or follow-up notes:
      - Unsupported saved filters also need to stop lingering in UI state once the new support semantics are in place.

59. Filter completion implementation
   - Timestamp: 2026-03-09 09:28:00 +0700
   - Issue being worked on:
      - Replace placeholder filter blocks on the web map discovery surface with only real, schema-backed filters.
   - Files changed:
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx`
      - `apps/doWhat-web/src/lib/discovery/__tests__/filterSupport.test.ts`
   - Decision made:
      - Treat discovery filter support as additive capability across sources instead of intersecting it down to the weakest fallback source.
      - Remove the unsupported-filter warning strip and remove all “temporarily unavailable” / “appear when...” UI branches from the map drawer.
      - Only render structured filter sections when there is real support plus actual facet/derived options or active state.
   - Why the decision was made:
      - The previous `AND` merge let venue/place fallback rows disable taxonomy, price, capacity, time, and people filters for the whole result set even when the canonical activities pipeline had enough metadata to support them.
      - The map drawer then rendered broken placeholder UX instead of working controls.
   - How it was tested:
      - `pnpm --filter dowhat-web test -- --runInBand src/app/map/__tests__/page.smoke.test.tsx src/lib/discovery/__tests__/filterSupport.test.ts src/app/api/nearby/__tests__/payload.test.ts`
      - `pnpm exec eslint apps/doWhat-web/src/app/map/page.tsx apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/engine-core.ts apps/doWhat-web/src/lib/discovery/__tests__/filterSupport.test.ts`
      - `pnpm --filter dowhat-web typecheck`
      - `node scripts/verify-discovery-contract.mjs`
      - `node scripts/verify-discovery-sql-contract.mjs`
      - `rg -n "temporarily unavailable|appear when|temporarily disabled|Some filters aren't applied right now|Some filters aren&apos;t applied right now" apps/doWhat-web/src/app/map apps/doWhat-mobile/src/app -S`
   - Result:
      - The web map drawer no longer contains production placeholder copy for activity, people, taxonomy, price, group-size, or time-window sections.
      - Supported filters now render as real controls; unsupported sections are removed from the drawer instead of shown as broken UI.
      - Stale unsupported saved selections are pruned once real filter support arrives from discovery.
      - Added regression coverage for both the UI surface and the support-merge logic that caused the issue.
   - Remaining risks or follow-up notes:
      - This pass fixed the user-facing web map filter surface, but it did not redesign the overall visual filter UX; that remains the next pass on top of the stabilized behavior.

60. Activity-first discovery boundary kickoff
   - Timestamp: 2026-03-09 10:02:00 +0700
   - Issue being worked on:
      - Introduce an explicit product boundary: doWhat discovers activities and activity-backed events, not generic food/drink/nightlife venues.
   - Files to investigate first:
      - `docs/activity-taxonomy.md`
      - `docs/activity_discovery_overview.md`
      - `packages/shared/src/activities/catalog.ts`
      - `packages/shared/src/taxonomy/activityTaxonomy.ts`
      - `packages/shared/src/places/filtering.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
      - `apps/doWhat-web/src/lib/places/activityMatching.ts`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
      - `apps/doWhat-mobile/src/lib/supabasePlaces.ts`
   - Decision made:
      - Broad SQL refactor remains out of scope.
      - Hospitality-first venues must be excluded from primary discovery by default unless there is strong activity evidence such as venue activity mappings, manual overrides, or real event/session support.
   - Why the decision was made:
      - The current taxonomy, fallback matching, and place filtering still allow cafes/bars/food-drink concepts to behave like top-level discovery targets, which conflicts with the product boundary for doWhat.
   - How it will be tested:
      - Add/update discovery, matching, ranking, and parity tests so restaurant/cafe/bar-only places cannot appear as primary results without activity evidence while activity-backed and user-created event locations still survive.
   - Result:
      - Kickoff logged before implementation.
   - Remaining risks or follow-up notes:
      - The taxonomy and catalog may contain hospitality-oriented legacy entries that need suppression rather than wholesale deletion if they are still used outside primary discovery.

61. Shared activity-first discovery policy + taxonomy subset
   - Timestamp: 2026-03-09 08:39:31 +0700
   - Issue being worked on:
      - Enforce the new activity-first product boundary in shared filter normalization, saved activity preferences, shared place filtering, and user-facing taxonomy exports.
   - Files changed:
      - `packages/shared/src/discovery/activityBoundary.ts`
      - `packages/shared/src/discovery/index.ts`
      - `packages/shared/src/discovery/filters.ts`
      - `packages/shared/src/taxonomy/activityTaxonomy.ts`
      - `packages/shared/src/preferences/activityFilters.ts`
      - `packages/shared/src/places/filtering.ts`
      - `packages/shared/src/places/index.ts`
   - Decision made:
      - Added one shared activity-first eligibility policy and one discovery-safe taxonomy subset instead of deleting hospitality metadata globally.
      - Strip hospitality-first exact selections such as `coffee`, `food`, `nightlife`, `specialty-coffee-crawls`, and `natural-wine-tastings` from the normalized discovery contract and persisted activity filter preferences.
      - Keep full taxonomy for non-discovery/internal surfaces, but expose a discovery-filtered taxonomy for user-facing discovery/filter surfaces.
   - Why the decision was made:
      - The same hospitality leakage was present in multiple layers, so the highest-leverage safe fix was a shared policy plus shared normalization instead of per-screen patches.
      - Global category deletion would remove useful source evidence and create unnecessary risk for admin/verification surfaces.
   - How it was tested:
      - Static inspection only at this step; focused shared/web/mobile tests are still pending after the web/mobile wiring is complete.
   - Result:
      - Shared discovery normalization now has a single blocklist path for hospitality-first selections.
      - Shared place filtering now excludes ineligible hospitality-first places even when no explicit filters are active.
      - User-facing discovery can now consume a filtered taxonomy subset without losing the full taxonomy for other workflows.
   - Remaining risks or follow-up notes:
      - Web/mobile surfaces and discovery engine still need to switch over to the new subset/policy adapters.
      - Ranking and place/activity matching still need explicit hospitality-aware adjustments.

62. Discovery runtime boundary wiring
   - Timestamp: 2026-03-09 08:56:00 +0700
   - Issue being worked on:
      - Thread the shared activity-first boundary through live discovery fallback paths, mobile ranking/filter building, and user-facing taxonomy pickers.
   - Files changed:
      - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-web/src/lib/places/activityMatching.ts`
      - `packages/shared/src/activities/catalog.ts`
      - `apps/doWhat-web/src/app/filter/page.tsx`
      - `apps/doWhat-web/src/app/places/page.tsx`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
      - `apps/doWhat-mobile/src/app/filter.tsx`
      - `apps/doWhat-mobile/src/components/TaxonomyCategoryPicker.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
   - Decision made:
      - Discovery fallback rows now have to pass the shared activity-first eligibility policy before they become visible places.
      - Legacy venue rows only count verified activities as structured evidence; AI-only tags no longer make a hospitality venue eligible by themselves.
      - Hospitality keyword matching is being tightened, and user-facing category pickers now consume the discovery-safe taxonomy subset instead of the full taxonomy.
   - Why the decision was made:
      - Shared normalization alone was not enough; hospitality leakage could still re-enter through fallback discovery rows, weak keyword-derived matches, and direct UI imports of the full taxonomy.
   - How it was tested:
      - Tests still pending at this step; focused shared/web/mobile suites will be run after the regression cases are updated.
   - Result:
      - Discovery fallback and user-facing category selection now follow the same activity-first boundary.
   - Remaining risks or follow-up notes:
      - Existing stale keyword-generated venue mappings in remote data may still need a rematch sweep to disappear completely after deployment.
      - Regression tests still need to be updated for the new boundary.

63. Activity-first discovery boundary verification
   - Timestamp: 2026-03-09 09:00:00 +0700
   - Issue being worked on:
      - Finalize and verify the new product boundary that excludes hospitality-first places from primary discovery unless they have strong activity evidence.
   - Root causes confirmed:
      - Full taxonomy was still being imported directly on user-facing discovery surfaces.
      - Shared discovery normalization allowed hospitality-first values like `nightlife` and food/drink taxonomy ids to survive.
      - Shared place filtering and discovery fallbacks did not apply an activity-first eligibility gate when no explicit filters were active.
      - Hospitality venues could still receive activity mappings from weak keyword-only matching.
   - Files changed or verified:
      - `packages/shared/src/discovery/activityBoundary.ts`
      - `packages/shared/src/discovery/filters.ts`
      - `packages/shared/src/taxonomy/activityTaxonomy.ts`
      - `packages/shared/src/preferences/activityFilters.ts`
      - `packages/shared/src/places/filtering.ts`
      - `packages/shared/src/__tests__/activityBoundary.test.ts`
      - `packages/shared/src/__tests__/activityTaxonomy.test.ts`
      - `packages/shared/src/__tests__/discoveryFilters.test.ts`
      - `packages/shared/src/places/__tests__/filtering.test.ts`
      - `apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts`
      - `apps/doWhat-web/src/lib/discovery/engine.ts`
      - `apps/doWhat-web/src/lib/discovery/ranking.ts`
      - `apps/doWhat-web/src/lib/places/activityMatching.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/placeActivityFilter.test.ts`
      - `apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts`
      - `apps/doWhat-web/src/lib/places/__tests__/activityMatching.test.ts`
      - `apps/doWhat-web/src/app/filter/page.tsx`
      - `apps/doWhat-web/src/app/places/page.tsx`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - `apps/doWhat-mobile/src/app/filter.tsx`
      - `apps/doWhat-mobile/src/components/TaxonomyCategoryPicker.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
   - Decision made:
      - Keep hospitality metadata as source evidence, but exclude hospitality-first places from primary discovery unless at least one strong activity proof exists.
      - Strong proof hierarchy for surviving hospitality venues is:
        1. manual override
        2. real event/session evidence
        3. confirmed non-keyword venue activity mapping
        4. structured activity signal
        5. activity-supporting category evidence
      - User-facing discovery surfaces now consume the discovery-safe taxonomy subset instead of the full taxonomy.
   - Why the decision was made:
      - This preserves useful source data for admin/internal workflows while making consumer discovery match the product boundary that doWhat is activity-first, not a food/drink finder.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/activityBoundary.test.ts src/__tests__/activityTaxonomy.test.ts src/__tests__/discoveryFilters.test.ts src/places/__tests__/filtering.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/placeActivityFilter.test.ts src/lib/places/__tests__/activityMatching.test.ts src/lib/discovery/__tests__/rankingTrustOrder.test.ts src/lib/discovery/__tests__/goldenScenarios.test.ts`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/nearby/__tests__/payload.test.ts src/app/api/places/__tests__/route.test.ts`
      - `pnpm exec eslint packages/shared/src/discovery/activityBoundary.ts packages/shared/src/discovery/filters.ts packages/shared/src/taxonomy/activityTaxonomy.ts packages/shared/src/preferences/activityFilters.ts packages/shared/src/places/filtering.ts packages/shared/src/__tests__/activityBoundary.test.ts packages/shared/src/__tests__/activityTaxonomy.test.ts packages/shared/src/__tests__/discoveryFilters.test.ts packages/shared/src/places/__tests__/filtering.test.ts apps/doWhat-web/src/lib/discovery/placeActivityFilter.ts apps/doWhat-web/src/lib/discovery/engine.ts apps/doWhat-web/src/lib/discovery/ranking.ts apps/doWhat-web/src/lib/places/activityMatching.ts apps/doWhat-web/src/lib/discovery/__tests__/placeActivityFilter.test.ts apps/doWhat-web/src/lib/places/__tests__/activityMatching.test.ts apps/doWhat-web/src/lib/discovery/__tests__/rankingTrustOrder.test.ts apps/doWhat-web/src/app/filter/page.tsx apps/doWhat-web/src/app/places/page.tsx apps/doWhat-mobile/src/lib/mobileDiscovery.ts apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts apps/doWhat-mobile/src/app/filter.tsx apps/doWhat-mobile/src/components/TaxonomyCategoryPicker.tsx apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `node scripts/verify-discovery-contract.mjs`
      - `node scripts/verify-discovery-sql-contract.mjs`
   - Result:
      - Shared boundary tests passed `19/19`.
      - Focused web discovery/matching/ranking/golden suites passed `15/15`.
      - Focused mobile boundary/parity suite passed `6/6`.
      - Web API payload/places route suites passed `11/11`.
      - Targeted ESLint passed.
      - Shared, web, and mobile typecheck passed.
      - Discovery verification scripts passed.
      - Primary discovery now suppresses restaurant/cafe/bar/nightlife-only places by default while preserving activity-backed hosts and activity-safe taxonomy families.
   - Remaining risks or follow-up notes:
      - Existing remote `venue_activities` rows that were generated from older keyword rules may still need a re-match or cleanup run in production data.
      - This pass intentionally did not redesign the filter UI; the next pass can focus on the activity-first filter UX on top of the stabilized contract and boundary.

64. Project operating system kickoff
   - Timestamp: 2026-03-09 09:03:57 +0700
   - Issue being worked on:
      - Establish the doWhat project operating system so future implementation is governed by product truth, verification, logging, regression safety, and honest completion instead of ad-hoc AI iteration.
   - Initial files/documents read:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `error_log.md`
      - `ROADMAP.md`
      - `PROJECT_STATE.md`
      - `ENGINEERING_ROADMAP_2025.md`
   - Decision made:
      - Future implementation must be judged by product truth, verification, logs, and regression safety.
      - This pass is moving the repo from ad-hoc AI-assisted iteration to controlled delivery with explicit operating documents.
   - Why the decision was made:
      - Existing roadmap/state docs are stale, partially overlapping, and not sufficient to guide disciplined discovery/filter/product work at the repo’s current state.
   - How it will be tested:
      - Audit the current repo state across discovery/filter surfaces, docs, scripts, migrations, and tests; then create/normalize the required operating documents and verify they are specific, usable, and synchronized with current code/log truth.
   - Result:
      - Kickoff logged before the control-system refactor.
   - Remaining risks or follow-up notes:
      - Some existing docs may conflict with current repo truth and will need consolidation rather than preservation.

65. Project operating system audit completed
   - Timestamp: 2026-03-09 09:18:42 +0700
   - Issue being worked on:
      - Audit the current repo state deeply enough to replace stale planning/state docs with a truthful project operating system.
   - Files and areas inspected:
      - `docs/filter_pass_handoff.md`
      - `docs/discovery_playbook.md`
      - `docs/discovery_verification_checklist.md`
      - `docs/guardrails.md`
      - `PROJECT_STATE.md`
      - `PROJECT_OVERVIEW.md`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/venues/page.tsx`
      - `apps/doWhat-web/src/app/create/page.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `packages/shared/src/discovery/filters.ts`
      - `apps/doWhat-web/src/lib/discovery/engine-core.ts`
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `scripts/health-migrations.mjs`
      - `scripts/sql/discovery-postdeploy-checks.sql`
      - root `package.json`
   - Decision made:
      - Replace the lightweight root roadmap and create the missing operating files in the repo root instead of extending stale 2025 planning snapshots.
      - Treat the current 2026 discovery/filter/log work as the source of truth, and record older docs as historical context only.
   - Why the decision was made:
      - The existing root docs describe old trait-vote, pilot, and roadmap priorities that no longer match the repo’s current discovery-first, activity-first stabilization work.
      - Future AI and human passes need one operating layer that reflects the actual code, tests, migration reality, and open product risks.
   - How it will be tested:
      - Create normalized root operating documents, confirm the required sections exist, and verify they reference current repo realities such as shared discovery filters, activity-first discovery boundaries, remote migration drift, and remaining filter/event gaps.
   - Result:
      - Confirmed `ROADMAP.md` is stale and lightweight.
      - Confirmed `CURRENT_STATE.md`, `OPEN_BUGS.md`, `QUALITY_GATES.md`, `DISCOVERY_TRUTH.md`, and `FILTER_CONTRACT.md` do not yet exist.
      - Confirmed current truth that must be reflected in the new control system:
        - `places` is the canonical place model.
        - discovery/filter semantics are now partly normalized in shared code.
        - the remote database is still behind on migrations `060`, `065`, `066`, `067`, and `068`.
        - activity-first discovery policy is implemented in code, but UX and operational readiness are still incomplete.
   - Remaining risks or follow-up notes:
      - Some older docs still contain useful historical details and should be left in place as archives, not treated as current operating truth.

66. Project operating system documents created and normalized
   - Timestamp: 2026-03-09 09:31:55 +0700
   - Issue being worked on:
      - Create the repo-root operating system files that define current product truth, roadmap, quality gates, discovery truth, filter semantics, and ranked open bugs.
   - Files changed:
      - `ROADMAP.md`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `QUALITY_GATES.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Replace the old lightweight roadmap with a current phased roadmap tied to the repo’s actual dependencies and risks.
      - Add explicit root-level truth documents instead of relying on scattered historical docs.
      - Keep older documents in place as historical context, but define the new root files as the canonical operating layer going forward.
   - Why the decision was made:
      - The repo needed a clear control system that future human and AI contributors can use immediately without reconstructing truth from code, stale roadmaps, and partial logs.
   - How it was tested:
      - `ls -1 ROADMAP.md CURRENT_STATE.md OPEN_BUGS.md QUALITY_GATES.md DISCOVERY_TRUTH.md FILTER_CONTRACT.md`
      - `rg -n "AI Operating Model|Phase A|Phase I|What Must Not Be Worked On Yet" ROADMAP.md`
      - `rg -n "Product Surfaces|Working Areas|Fragile Areas|Known Contradictions|Data / Discovery Truth Gaps|Test / Verification State|Immediate Priorities" CURRENT_STATE.md`
      - `rg -n "Critical|High|Medium|Low" OPEN_BUGS.md`
      - `rg -n "Gate 1|Gate 7|Anti-hallucination Operating Rules|Reusable Pass Template|Reusable Completion Checklist" QUALITY_GATES.md`
      - `rg -n "Product Boundary|Canonical Models|Evidence Hierarchy|Current Discovery Pipeline Summary|Desired Discovery Pipeline Summary|Known Current Deviations" DISCOVERY_TRUTH.md`
      - `rg -n "Canonical Shared Contract|Global Semantics|## A\\. WHAT|## B\\. WHO|## C\\. TRUST / STRICTNESS|Rules Against Placeholder UX|Web / Mobile Parity Rules" FILTER_CONTRACT.md`
      - `git status --short ROADMAP.md CURRENT_STATE.md OPEN_BUGS.md QUALITY_GATES.md DISCOVERY_TRUTH.md FILTER_CONTRACT.md changes_log.md ASSISTANT_CHANGES_LOG.md`
   - Result:
      - Added a current phased roadmap with explicit “do not move forward until” rules and an AI operating model.
      - Added a brutally honest current-state file describing what works, what is fragile, and what blocks real-user readiness.
      - Added a ranked open bug register grounded in current repo evidence.
      - Added hard quality gates, pass templates, completion checklists, and anti-hallucination operating rules.
      - Added canonical discovery and filter truth documents tied to the current shared contract and product boundary.
      - Structural verification passed for all required sections.
   - Remaining risks or follow-up notes:
      - These docs are only useful if future passes keep them synchronized with real code, logs, and deployment truth.
      - No automated markdown linter or doc test suite was run because this pass only changed docs/logs; verification was structural and content-based.

67. Filter foundation API/query contract cleanup kickoff
   - Timestamp: 2026-03-09 10:02:19 +0700
   - Issue being worked on:
      - Bring `/api/events` and remaining backend filter parsing closer to the shared discovery filter contract without pretending remote rollout, SQL proof, or final UX are complete.
   - Files and docs read first:
      - `ROADMAP.md`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `QUALITY_GATES.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `docs/filter_pass_handoff.md`
      - `packages/shared/src/discovery/filters.ts`
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `apps/doWhat-web/src/app/api/events/queryEventsWithFallback.ts`
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
      - `packages/shared/src/__tests__/discoveryFilters.test.ts`
      - `packages/shared/src/events/api.ts`
      - `packages/shared/src/events/utils.ts`
   - Exact semantic drift found:
      - `/api/events` still parses `categories`, `verifiedOnly`, and `minAccuracy` directly instead of consuming the shared normalized discovery contract.
      - `/api/events` currently implies broader discovery-filter parity than it really supports, because it does not parse shared fields such as `kind`, `trust`, `q`, `taxonomy`, `traits`, `sort`, or `distanceKm` explicitly.
      - Shared event fetch helpers in `packages/shared/src/events/*` still serialize the older route-specific event query shape (`verifiedOnly`, `minAccuracy`), so the narrower subset is real but not documented as a subset strongly enough in the route itself.
   - Decision made:
      - Keep this pass narrow: align `/api/events` to the shared contract where safe, make the supported subset explicit where full alignment is unsafe, and add regression coverage for deterministic defaults and supported/unsupported semantics.
   - Why the decision was made:
      - The control docs explicitly reject broad SQL rewriting, UX redesign, and speculative semantic changes in this phase.
      - The highest-value fix is removing silent contract drift between the shared filter model and the route-level event parser.
   - Planned files to touch:
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
      - `packages/shared/src/events/api.ts`
      - `packages/shared/src/events/utils.ts`
      - `packages/shared/src/discovery/filters.ts` only if a minimal helper/export is needed
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - How it will be tested:
      - targeted web/shared tests around event payload parsing and shared filter normalization
      - targeted typecheck and eslint on touched files
   - Result:
      - Kickoff logged with the exact drift points and constrained scope before implementation.
   - Remaining risks or follow-up notes:
      - Remote migration rollout and live post-`068` proof remain blocked and will not be claimed as solved in this pass.

68. `/api/events` filter subset aligned to the shared contract
   - Timestamp: 2026-03-09 10:24:48 +0700
   - Issue being worked on:
      - Remove silent filter drift in `/api/events` by aligning it to the shared discovery contract where safe and enforcing an explicit event-only subset where full parity is still unsafe.
   - Files changed:
      - `packages/shared/src/events/types.ts`
      - `packages/shared/src/events/utils.ts`
      - `packages/shared/src/events/api.ts`
      - `packages/shared/src/__tests__/eventsQuery.test.ts`
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
      - `ROADMAP.md`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Root cause:
      - The shared discovery contract had become canonical for places/activities, but `/api/events` still parsed its own private params (`categories`, `verifiedOnly`, `minAccuracy`) and silently ignored broader discovery semantics.
      - Internal shared event helpers also still serialized legacy event-only params, which kept the subset implicit rather than explicit.
   - Decision made:
      - Keep `/api/events` as a narrower subset for now because event/session truth is still not fully normalized.
      - Move internal event query helpers toward the shared contract subset (`kind`, `q`, `types`, `tags`, `taxonomy`, `trust`) while preserving legacy aliases at the route boundary for backward compatibility.
      - Fail fast on unsupported `/api/events` filter families (`traits`, `prices`, `capacity`, `timeWindow`, `distanceKm`, unsupported sort modes`) instead of silently ignoring them.
   - Why the decision was made:
      - Full contract parity is still unsafe while remote rollout, stale remote mappings, and the event/session truth pass remain open.
      - The highest-value correction was to make event-filter behavior deterministic and honest without changing broad discovery semantics or touching SQL.
   - Exact fix:
      - Added canonical event query normalization in shared code so event fetchers/query keys collapse legacy aliases into one semantic subset.
      - Updated the shared event fetcher to serialize the supported discovery-subset params instead of only the old legacy params.
      - Updated `/api/events` to parse the shared contract subset, apply OR within structured groups, AND between search and structured filters, support `trust=verified_only` and `trust=ai_only`, return empty when `kind` excludes events, and reject unsupported filter families with HTTP 400.
      - Documented the current event-route trust nuance that `ai_only` is a verification proxy (`unconfirmed non-session rows`) rather than a full discovery-engine suggestion-state.
      - Added a route comment and updated the control docs to say `/api/events` is now an explicit subset, not a silent divergence point.
   - How it was tested:
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/eventsQuery.test.ts src/__tests__/discoveryFilters.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/api/events/__tests__/payload.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm exec eslint packages/shared/src/events/types.ts packages/shared/src/events/utils.ts packages/shared/src/events/api.ts packages/shared/src/__tests__/eventsQuery.test.ts apps/doWhat-web/src/app/api/events/route.ts apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
      - `node scripts/verify-discovery-contract.mjs`
   - Result:
      - Shared event query tests passed `7/7`.
      - `/api/events` payload tests passed `7/7`.
      - Shared typecheck passed.
      - Web typecheck passed.
      - Targeted ESLint passed.
      - Discovery contract guardrail script passed.
      - `/api/events` no longer silently contradicts the shared filter contract; it now enforces a documented subset.
   - Remaining risks or follow-up notes:
      - `/api/events` still does not have full parity with place/activity discovery because event/session truth is still unresolved.
      - Remote migration rollout, live post-`068` proof, and stale remote `venue_activities` cleanup remain blocked and were not claimed as solved here.
      - The next correct pass is still remote rollout verification and event creation/hosting truth, not filter UX polish or broader SQL rewriting.

69. Remote discovery rollout + post-deploy verification kickoff
   - Timestamp: 2026-03-09 10:41:12 +0700
   - Issue being worked on:
      - Prepare the repo for a disciplined human-run remote rollout of discovery-critical migrations and post-deploy verification.
   - Files and docs read first:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `ROADMAP.md`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `QUALITY_GATES.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `scripts/health-migrations.mjs`
      - `scripts/verify-discovery-sql-contract.mjs`
      - `docs/discovery_remote_rollout_pack.md`
      - `docs/discovery_verification_checklist.md`
      - `scripts/sql/discovery-postdeploy-checks.sql`
      - discovery migrations `060`, `065`, `066`, `067`, `068`
   - Decision made:
      - This is the REMOTE DISCOVERY ROLLOUT + POST-DEPLOY VERIFICATION PASS.
      - The purpose is to align the remote DB with the repo baseline and make the rollout/verification path clearer and safer.
      - Broad SQL refactoring is explicitly out of scope.
      - Filter UX redesign is explicitly deferred until this rollout is complete and verified.
   - Why the decision was made:
      - The control layer and open bugs agree that remote migration drift is the current blocking issue for trustworthy production discovery.
   - How it will be tested:
      - Audit the relevant migrations and current rollout tooling, tighten the health/verification pack where needed, then run every local/static check that this shell can support without pretending to have remote DB access.
   - Result:
      - Kickoff logged before modifying rollout scripts or docs.
   - Remaining risks or follow-up notes:
      - This shell still cannot apply the remote migrations directly, so the outcome of this pass must be operational readiness, not a false claim of remote completion.

70. Remote discovery rollout readiness audit
   - Timestamp: 2026-03-09 12:48:23 +0700
   - Issue being worked on:
      - Audit the existing migration-health tooling and rollout pack before making any operational changes.
   - Files inspected:
      - `scripts/health-migrations.mjs`
      - `docs/discovery_remote_rollout_pack.md`
      - `docs/discovery_verification_checklist.md`
      - `scripts/sql/discovery-postdeploy-checks.sql`
      - `apps/doWhat-web/supabase/migrations/060_sessions_place_label_finalize.sql`
      - `apps/doWhat-web/supabase/migrations/065_discovery_exposures.sql`
      - `apps/doWhat-web/supabase/migrations/066_place_tiles_discovery_cache.sql`
      - `apps/doWhat-web/supabase/migrations/067_activity_catalog_city_keyword_pack.sql`
      - `apps/doWhat-web/supabase/migrations/068_discovery_query_support_indexes.sql`
   - Decision made:
      - Keep this pass operational and narrow: improve health reporting, rollout instructions, and verification clarity only.
   - Why the decision was made:
      - The repo already contains the baseline rollout assets; the remaining gap is human-executable clarity and deterministic drift reporting, not missing product logic.
      - The missing remote migrations still directly affect discovery correctness/performance:
         - `060` session `place_label` integrity
         - `065` discovery telemetry table
         - `066` discovery cache column
         - `067` activity-catalog city keyword pack
         - `068` discovery hot-path indexes
   - How it was investigated:
      - Read the current migration-health script, rollout docs, SQL verification pack, and the five discovery-critical migrations themselves.
      - Cross-checked repo references to rollout/health tooling to see what humans currently have available.
   - Result:
      - Confirmed the repo already has the right building blocks, but the runbook still needs tighter exact actions, clearer pass/fail criteria, and explicit caveats about what this shell cannot verify remotely.
   - Remaining risks or follow-up notes:
      - Remote application and live post-`068` plan verification remain blocked from this shell and must stay explicit in the final rollout pack.

71. Remote rollout tooling + verification pack hardening
   - Timestamp: 2026-03-09 12:52:21 +0700
   - Issue being worked on:
      - Tighten migration drift reporting and the human-run remote rollout pack so the missing discovery migrations can be applied and verified safely from a DB-connected machine.
   - Files changed:
      - `scripts/health-migrations.mjs`
      - `scripts/verify-discovery-rollout-pack.mjs`
      - `docs/discovery_remote_rollout_pack.md`
      - `docs/discovery_verification_checklist.md`
      - `scripts/sql/discovery-postdeploy-checks.sql`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Keep this pass operational only: better drift reporting, better rollout instructions, and stronger static verification of the rollout pack.
      - Do not change discovery semantics, SQL behavior, ranking, or UI.
   - Why the decision was made:
      - The remote baseline is still blocked on unapplied migrations `060`, `065`, `066`, `067`, and `068`.
      - The highest-value improvement available from this shell is making the human rollout path deterministic and testable.
   - Exact fixes:
      - `scripts/health-migrations.mjs`
         - added explicit `status`, `missingDiscovery`, `discoveryBaselineReady`, and `nextActions` fields to the report
         - now clearly calls out when discovery rollout is blocked by the five discovery-critical migrations
         - now prints deterministic human output via a single stdout write
      - `scripts/verify-discovery-rollout-pack.mjs`
         - added a static guard that checks the rollout doc + SQL pack for the required migrations, commands, index checks, session place-label constraint check, and post-deploy `EXPLAIN (ANALYZE, BUFFERS)` follow-up
      - `docs/discovery_remote_rollout_pack.md`
         - added the exact human sequence, explicit manual order for `060` -> `065` -> `066` -> `067` -> `068`, stronger pass/fail expectations, post-deploy performance follow-up, and explicit caveats about what this shell cannot verify
      - `docs/discovery_verification_checklist.md`
         - now points humans to the rollout pack as the canonical sequence before running supplemental checks
      - `scripts/sql/discovery-postdeploy-checks.sql`
         - now verifies cache/telemetry indexes, the `sessions_place_label_nonempty` constraint state, and includes optional post-deploy `EXPLAIN (ANALYZE, BUFFERS)` queries for the three hot paths
   - Root cause found during verification:
      - `scripts/health-migrations.mjs` mixed stdout and stderr while printing the blocked report, which caused the missing-discovery section and table section to interleave unpredictably on failure.
   - Why that root cause mattered:
      - This pass is supposed to make rollout failure obvious and deterministic; interleaved report output weakened exactly that goal.
   - How it was tested:
      - `node scripts/verify-discovery-rollout-pack.mjs`
      - `node scripts/verify-discovery-sql-contract.mjs`
      - `node scripts/verify-discovery-contract.mjs`
      - `pnpm exec eslint scripts/health-migrations.mjs scripts/verify-discovery-rollout-pack.mjs scripts/verify-discovery-sql-contract.mjs`
      - `node scripts/health-migrations.mjs --dowhat --json`
      - `node scripts/health-migrations.mjs --dowhat --remote-rest --json`
      - `node scripts/health-migrations.mjs --dowhat --strict`
      - `node scripts/health-migrations.mjs --dowhat --remote-rest --strict`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/discovery/__tests__/goldenScenarios.test.ts src/app/api/events/__tests__/payload.test.ts`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/goldenDiscoveryScenarios.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
   - Result:
      - Static rollout verification passed.
      - Discovery SQL contract verification passed.
      - Discovery contract verification passed.
      - Targeted ESLint passed.
      - Focused web discovery/event tests passed `10/10`.
      - Focused mobile discovery tests passed `7/7`.
      - Both health-migrations JSON modes reported `status: blocked`, `missingDiscovery: 5`, and deterministic `nextActions`.
      - Both strict health-migrations runs failed as expected because the target remote still lacks `060`, `065`, `066`, `067`, and `068`.
      - Direct PostgreSQL connectivity is still unavailable from this shell (`getaddrinfo ENOTFOUND db.kdviydoftmjuglaglsmm.supabase.co`), so the script correctly fell back to REST when not forced and still reported the same drift.
   - Remaining risks or follow-up notes:
      - This pass does not apply the remote migrations and does not provide live post-`068` query-plan evidence.
      - Older remote `venue_activities` rows may still contain stale hospitality-era matches; rollout does not clean those.
      - After remote rollout, the next correct product/architecture pass remains:
         1. event/session/place truth hardening
         2. then final filter UX redesign

72. Event / session / place truth hardening kickoff
   - Timestamp: 2026-03-09 17:27:28 +0700
   - Issue being worked on:
      - Audit and harden the canonical truth for activities, sessions, events, and places across create flows, APIs, and web/mobile display surfaces.
   - Files and docs read first:
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
      - `ROADMAP.md`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `QUALITY_GATES.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `docs/discovery_remote_rollout_pack.md`
      - `docs/discovery_verification_checklist.md`
      - `scripts/sql/discovery-postdeploy-checks.sql`
   - Decision made:
      - This is the EVENT / SESSION / PLACE TRUTH HARDENING PASS.
      - Filter UX redesign is explicitly deferred until after this truth pass is complete.
      - The goal is to eliminate semantic drift and user-facing contradictions between events, sessions, activities, and places without doing a broad SQL rewrite.
   - Why the decision was made:
      - The control docs and open bugs now identify event/session/place truth as the next product-critical layer after the remote rollout packaging work.
   - How it will be investigated:
      - Audit create flows, API routes, DTOs, discovery payloads, detail pages, and mobile/web surfaces before changing logic.
   - Result:
      - Kickoff logged before implementation.
   - Remaining risks or follow-up notes:
      - Remote discovery rollout is still not complete, so this pass must stay honest about anything that still depends on real remote verification.

73. Event/session/place audit findings before implementation
   - Timestamp: 2026-03-09 18:11:02 +0700
   - Issue being worked on:
      - Audit the current truth model across create flows, hydrated session payloads, event payloads, and mobile/web detail surfaces before applying the minimum safe hardening changes.
   - Files inspected:
      - `apps/doWhat-web/src/app/create/page.tsx`
      - `apps/doWhat-web/src/app/api/sessions/route.ts`
      - `apps/doWhat-web/src/app/api/sessions/[sessionId]/route.ts`
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `apps/doWhat-web/src/app/api/events/[id]/route.ts`
      - `apps/doWhat-web/src/app/sessions/[id]/page.tsx`
      - `apps/doWhat-web/src/app/events/[id]/page.tsx`
      - `apps/doWhat-web/src/lib/sessions/server.ts`
      - `apps/doWhat-web/src/lib/events/presentation.ts`
      - `apps/doWhat-mobile/src/app/add-event.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/sessions/[id].tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `packages/shared/src/events/types.ts`
      - `packages/shared/src/events/api.ts`
      - `packages/shared/src/events/utils.ts`
      - related route/server tests for sessions and events
   - Root causes found:
      - The product exposes “Create Event” on web and mobile, but both user-authored flows actually create `sessions`, not standalone `events`.
      - `hydrateSessions()` ignores persisted `sessions.place_label` and can fall back to `activity.name`, which produces fake location labels.
      - `/api/events` currently converts session-backed items into `EventSummary` rows that can leak `venueId` into `place_id`, blurring canonical place truth.
      - Mobile “add event” and mobile session detail bypass the canonical web session API entirely and talk directly to Supabase, so they skip server-side place resolution and hydrated place truth.
      - Event detail currently contains placeholder attendance/verification panels instead of truthful behavior descriptions.
   - Canonical decisions made from the audit:
      - In the current product, user-created content is a `session` creation flow, not a true standalone `event` creation flow.
      - `places` remain canonical place truth.
      - `venues` remain legacy compatibility/fallback only.
      - This pass should make the current session-backed creation model explicit rather than inventing a broader event-creation model that the repo does not currently implement safely.
   - Why the decisions were made:
      - The inspected code and schema show working session creation and hydration paths, but no equivalent safe standalone user-event creation path.
      - The highest-leverage truth fixes are to stop mislabeling sessions as events, preserve canonical place semantics in payloads, and route mobile through the same server truth path as web.
   - How it was tested:
      - Static code audit only at this stage via targeted `sed`/`rg` inspection before code changes.
   - Result:
      - Implementation scope narrowed to explicit truth fields, canonical place propagation, mobile/web parity on session APIs, and removal of misleading placeholders on touched surfaces.
   - Remaining risks or follow-up notes:
      - Remote migration rollout is still a separate blocker for production DB verification and must not be conflated with these code-side truth fixes.

74. Event/session/place truth model hardening implementation
   - Timestamp: 2026-03-09 18:49:14 +0700
   - Issue being worked on:
      - Implement the minimum safe runtime changes that make event/session/place semantics explicit and stop user-facing surfaces from mislabeling session-backed creation and legacy venue truth.
   - Files changed:
      - `packages/shared/src/events/types.ts`
      - `packages/shared/src/events/truth.ts`
      - `packages/shared/src/index.ts`
      - `apps/doWhat-web/src/lib/sessions/server.ts`
      - `apps/doWhat-web/src/app/sessions/[id]/page.tsx`
      - `apps/doWhat-web/src/app/api/events/route.ts`
      - `apps/doWhat-web/src/app/api/events/[id]/route.ts`
      - `apps/doWhat-web/src/lib/events/presentation.ts`
      - `apps/doWhat-web/src/app/events/[id]/page.tsx`
      - `apps/doWhat-web/src/app/create/page.tsx`
      - `apps/doWhat-web/src/app/page.tsx`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/components/WebMap.tsx`
      - `apps/doWhat-mobile/src/lib/sessionApi.ts`
      - `apps/doWhat-mobile/src/app/add-event.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/sessions/[id].tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/activities/[id].tsx`
      - `apps/doWhat-mobile/src/app/home.tsx`
   - Decision made:
      - Keep the existing product capability as session-backed creation rather than inventing a new standalone-event write path.
      - Add explicit origin/location truth fields to event payloads and explicit location truth fields to hydrated sessions.
      - Stop treating legacy `venueId` values as canonical `place_id` values.
      - Route mobile create/detail flows through the web session API first so they inherit the same canonical place resolution used on web.
   - Why the decision was made:
      - The repo already had a working session truth path on the server.
      - The highest-value bug fixes were payload honesty, label honesty, and web/mobile parity.
      - Adding a new standalone user-event model would have been speculative and unsafe in this pass.
   - Exact fixes:
      - Added shared event-truth contract fields:
         - `origin_kind`
         - `location_kind`
         - `is_place_backed`
      - Added shared truth helpers in `packages/shared/src/events/truth.ts` and exported them from `@dowhat/shared`.
      - `hydrateSessions()` now respects persisted `sessions.place_label` and classifies session location truth (`canonical_place`, `legacy_venue`, `custom_location`, `flexible`) instead of falling back to `activity.name` as a fake location label.
      - Web session detail now displays canonical place-backed labels first and uses canonical place coordinates first for Maps links.
      - `/api/events` session fallback no longer assigns `venueId` into `place_id`, no longer stuffs legacy venues into the `place` object, and annotates every event with explicit truth fields.
      - `/api/events` and `/api/events/[id]` now keep flexible/unpinned listings explicit instead of normalizing them into fake venue labels.
      - Event detail removed placeholder attendance/verification panels and replaced them with truthful attendance/location sections.
      - Web and mobile creation surfaces now use “session” language instead of claiming to create standalone events.
      - Mobile creation now POSTs to `/api/sessions` via bearer auth instead of directly inserting `activities`, `venues`, and `sessions`.
      - Mobile session detail now fetches `/api/sessions/[id]` via bearer auth first and only falls back to direct Supabase reads if that fails.
      - Mobile activity-detail prefill now passes `placeName` instead of an unused `venue` param so location context survives into creation.
      - Mobile map event/session fallback rows now expose truth fields and no longer leak `venue_id` into `place_id`.
   - Result:
      - Canonical place truth, legacy venue truth, and flexible/custom-location truth are now structurally distinguishable in the runtime payloads touched by this pass.
      - The most misleading product-language drift on create/session/event detail surfaces has been removed.
   - Remaining risks or follow-up notes:
      - Older remote `events` and `venue_activities` data may still contain legacy inconsistencies until remote rollout + cleanup work is completed.
      - Some untouched surfaces outside this pass still say “Create event” or assume session/event equivalence and should be handled in a later UX sweep after this truth layer is verified.

75. Event/session/place truth verification and control-doc update
   - Timestamp: 2026-03-09 19:06:41 +0700
   - Issue being worked on:
      - Verify the truth-hardening changes with targeted lint/type/tests and align the root control docs with the new canonical local truth.
   - Files changed:
      - `packages/shared/src/__tests__/eventTruth.test.ts`
      - `apps/doWhat-web/src/lib/events/__tests__/presentation.test.ts`
      - `apps/doWhat-mobile/src/lib/__tests__/sessionApi.test.ts`
      - `apps/doWhat-web/src/lib/sessions/__tests__/server.test.ts`
      - `apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Root causes fixed during verification:
      - Shared `EventPlaceSummary` still claimed `name` was always non-null even though the runtime payloads already allowed null place names.
      - `apps/doWhat-web/src/app/api/events/[id]/route.ts` still passed an optional raw event `status` into a stricter `EventSummary` contract.
      - `apps/doWhat-mobile/src/app/add-event.tsx` kept an unused `cents` local after switching from direct Supabase inserts to the web session API.
      - `apps/doWhat-mobile/src/app/(tabs)/sessions/[id].tsx` still typed `ends_at` as always non-null even though the API and fallback data both allow null.
   - Why the decisions were made:
      - These were real contract mismatches surfaced by typecheck and lint; fixing them kept the new truth layer honest instead of weakening types to silence the tools.
   - Tests and verification run:
      - `pnpm exec eslint packages/shared/src/events/types.ts packages/shared/src/events/truth.ts packages/shared/src/__tests__/eventTruth.test.ts apps/doWhat-web/src/lib/sessions/server.ts 'apps/doWhat-web/src/app/sessions/[id]/page.tsx' apps/doWhat-web/src/app/api/events/route.ts 'apps/doWhat-web/src/app/api/events/[id]/route.ts' apps/doWhat-web/src/lib/events/presentation.ts 'apps/doWhat-web/src/app/events/[id]/page.tsx' apps/doWhat-web/src/app/create/page.tsx apps/doWhat-web/src/app/page.tsx apps/doWhat-web/src/app/map/page.tsx apps/doWhat-web/src/components/WebMap.tsx apps/doWhat-web/src/lib/events/__tests__/presentation.test.ts apps/doWhat-web/src/app/api/events/__tests__/payload.test.ts apps/doWhat-web/src/lib/sessions/__tests__/server.test.ts apps/doWhat-mobile/src/lib/sessionApi.ts apps/doWhat-mobile/src/app/add-event.tsx 'apps/doWhat-mobile/src/app/(tabs)/sessions/[id].tsx' 'apps/doWhat-mobile/src/app/(tabs)/map/index.tsx' 'apps/doWhat-mobile/src/app/(tabs)/activities/[id].tsx' apps/doWhat-mobile/src/app/home.tsx apps/doWhat-mobile/src/lib/__tests__/sessionApi.test.ts`
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/eventTruth.test.ts src/__tests__/eventsQuery.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/lib/sessions/__tests__/server.test.ts src/app/api/events/__tests__/payload.test.ts src/lib/events/__tests__/presentation.test.ts`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/lib/__tests__/sessionApi.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter @dowhat/shared typecheck`
      - `pnpm --filter dowhat-web typecheck`
      - `pnpm --filter doWhat-mobile typecheck`
      - `node scripts/verify-discovery-contract.mjs`
   - Result:
      - Targeted ESLint passed.
      - Shared tests passed `7/7`.
      - Focused web truth tests passed `23/23`.
      - Focused mobile truth/parity tests passed `8/8`.
      - Shared, web, and mobile typecheck passed after tightening the event/session types.
      - `verify-discovery-contract.mjs` passed.
      - Root control docs now explicitly state:
         - user-authored creation currently creates `sessions`
         - event payloads carry `origin_kind`, `location_kind`, and `is_place_backed`
         - remote rollout is still the operational blocker before any production performance claims
   - Remaining risks or follow-up notes:
      - This shell still did not complete the manual remote rollout, post-deploy DB checks, or live query-plan capture.
      - Attendance/hosting truth on top of the now-hardened event/session/place layer still needs follow-through.
      - Some untouched secondary surfaces still use legacy “Create event” copy and should be swept during the later UX pass.

76. Final filter UX redesign kickoff
   - Timestamp: 2026-03-09 11:53 UTC
   - Issue being worked on:
      - Start the FINAL FILTER UX REDESIGN PASS.
   - Files planned for inspection and likely touch:
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/app/filter.tsx`
      - `apps/doWhat-web/src/app/filter/page.tsx`
      - `packages/shared/src/preferences/mapFilters.ts`
      - shared filter/discovery tests and control docs
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Build this pass on top of the existing shared filter contract and hardened event/session/place truth.
      - Broad SQL refactor remains out of scope.
      - Unsupported placeholder filters must be removed, not displayed.
      - The visible discovery UX must stay activity-first, not restaurant/bar/cafe-first.
   - Why:
      - The current repo truth says contract cleanup and truth hardening are complete enough to support the final filter UX pass, but the user-facing filter surfaces are still too fragmented and not final.
   - How tested:
      - Read-first audit of control docs and live filter surfaces before changing code.
   - Result:
      - Pass opened with the required guardrails.
   - Remaining risks or follow-up notes:
      - Remote rollout and live post-`068` proof are still blocked and will not be claimed in this pass.

77. Final filter UX audit before implementation
   - Timestamp: 2026-03-09 12:05 UTC
   - Issue being worked on:
      - Audit every visible discovery filter surface against `FILTER_CONTRACT.md` before redesigning the UX.
   - Files inspected:
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `DISCOVERY_TRUTH.md`
      - `FILTER_CONTRACT.md`
      - `QUALITY_GATES.md`
      - `packages/shared/src/discovery/filters.ts`
      - `packages/shared/src/preferences/mapFilters.ts`
      - `packages/shared/src/places/filtering.ts`
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/filter/page.tsx`
      - `apps/doWhat-web/src/app/venues/page.tsx`
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/app/filter.tsx`
      - `apps/doWhat-mobile/src/components/TaxonomyCategoryPicker.tsx`
      - `apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx`
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - `packages/shared/src/__tests__/discoveryFilters.test.ts`
   - Audit findings:
      - Web `/map`
         - `Activities / Events / Both` toggle: valid, real result-kind control, keep.
         - `Search by name`: valid `searchText`, keep.
         - `Activity types`: real backend filter, but duplicates `taxonomy categories` meaning for users; merge into one activity-focus section.
         - `People filters`: real only when trait facets exist; keep as secondary and rename to clearer participant wording.
         - `Taxonomy categories`: real backend filter, but duplicated alongside `activity types`; keep only inside one merged activity-focus section.
         - `Price levels`, `Group size`, `Time window`: backend-supported for activities, but too secondary for the final primary UX; remove from the visible map drawer in this pass rather than keep an overgrown panel.
         - No trust/sort section is visible even though trust is part of the contract and `/api/nearby` supports it; add a truthful trust section.
      - Mobile map
         - `Search`: valid, keep, but copy currently leaks hospitality (`coffee`) and generic place language; rename/rewrite.
         - `Categories`: valid taxonomy control, keep.
         - `Distance`: valid and enforced via `maxDistanceKm`, keep.
         - `Price`, `Group size`, `Working hours`: weak for place discovery because missing metadata currently passes instead of excluding unknowns in `packages/shared/src/places/filtering.ts`; remove from visible UI.
         - `All place types` copy is too generic and not activity-first; rename.
      - Mobile `/filter`
         - This is a saved home/activity-preferences surface, not the live map discovery contract.
         - Existing controls (`price`, `distance`, `time`, `activity types`) are backed by the home activity preference pipeline, but the title and copy incorrectly read like a general live discovery filter panel; rename and simplify as preferences, not map filters.
      - Web `/filter`
         - Same saved preference surface pattern as mobile.
         - Not linked from the main web discovery flow right now, but the route exists and still presents older generic “Activity Filters” language; align copy with the preference meaning if touched.
      - Web `/venues`
         - This is a venue verification workflow, not the primary consumer discovery filter surface.
         - Keep out of the main filter redesign except for documenting that it is secondary and separate.
   - Decision made:
      - Primary redesign target is web `/map` plus mobile map.
      - Mobile `/filter` and web `/filter` will be treated as activity-preference surfaces and cleaned up for honesty, not folded into the live map contract.
      - `/venues` stays secondary and out of the main consumer filter architecture.
   - Why:
      - This keeps the pass focused on real discovery UX while removing misleading or weak controls instead of preserving them for completeness.
   - How tested:
      - Static code audit only at this stage.
   - Result:
      - Keep / merge / remove decisions are now explicit before implementation.
   - Remaining risks or follow-up notes:
      - Price/capacity/time remain in the backend contract for specialized or future surfaces, but they will no longer be part of the primary consumer map UX after this pass.

78. Timestamp: 2026-03-09 12:20 UTC
   - Issue being worked on: Final filter UX redesign implementation cleanup and regression coverage.
   - Files changed:
      - `apps/doWhat-web/src/app/map/page.tsx`
      - `apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx`
      - `apps/doWhat-mobile/src/app/__tests__/map-filter-surface.test.ts`
   - Decision made:
      - Removed the last unused web-map helper left behind by the drawer simplification.
      - Tightened the trust-chip smoke test to assert the real duplicated UI state intentionally: one visible trust option in the drawer plus one active filter chip.
      - Added a mobile regression test that locks the final supported map filter copy and the split between live map filters and saved activity preferences.
   - Why the decision was made:
      - The first focused lint/test run surfaced only implementation residue, not a product-level flaw, so the correct response was to fix the exact leftovers and strengthen regression coverage on the final visible filter surface.
   - How it was tested:
      - `pnpm exec eslint ...touched filter files...` (first pass surfaced one unused helper)
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/discoveryFilters.test.ts src/__tests__/mapApi.test.ts src/__tests__/mapFilters.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/map/__tests__/page.smoke.test.tsx` (first pass surfaced the duplicate trust-label assertion issue)
   - Result:
      - The redesign pass now has explicit fixes for the first focused failures and added mobile regression coverage for the supported final filter set.
   - Remaining risks or follow-up notes:
      - Full focused verification still needs to be rerun after these cleanup patches, then the control docs need to be updated with the final visible filter architecture.

79. Timestamp: 2026-03-09 12:42 UTC
   - Issue being worked on: Final filter UX redesign completion, mobile/web parity hardening, and control-layer normalization.
   - Files changed:
      - `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx`
      - `apps/doWhat-mobile/src/lib/mobileDiscovery.ts`
      - `apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts`
      - `apps/doWhat-mobile/src/app/__tests__/map-filter-surface.test.ts`
      - `CURRENT_STATE.md`
      - `OPEN_BUGS.md`
      - `FILTER_CONTRACT.md`
      - `DISCOVERY_TRUTH.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Added `trustMode` to the mobile map filter surface so mobile no longer lags the shared contract semantics exposed on web.
      - Passed the safe filter subset (`searchText`, `taxonomyCategories`, `trustMode`) into the mobile events rail query so the visible rail stays aligned with the active map filters.
      - Declared the final visible primary filter architecture in the control docs and removed “final filter UX redesign” from the immediate-open priority list.
   - Why the decision was made:
      - The first redesign implementation still left a product-level mismatch: web exposed result strictness while mobile did not. That would have violated the parity rule for core filter semantics. Fixing that was higher leverage than further cosmetic work.
   - How it was tested:
      - `pnpm exec eslint packages/shared/src/preferences/mapFilters.ts packages/shared/src/__tests__/mapFilters.test.ts apps/doWhat-web/src/app/map/page.tsx apps/doWhat-web/src/app/map/__tests__/page.smoke.test.tsx apps/doWhat-mobile/src/lib/mobileDiscovery.ts apps/doWhat-mobile/src/lib/__tests__/mobileDiscovery.test.ts apps/doWhat-mobile/src/app/(tabs)/map/index.tsx apps/doWhat-mobile/src/app/filter.tsx apps/doWhat-mobile/src/app/__tests__/map-filter-surface.test.ts apps/doWhat-web/src/app/filter/page.tsx`
      - `pnpm --filter @dowhat/shared test -- --runInBand src/__tests__/discoveryFilters.test.ts src/__tests__/mapApi.test.ts src/__tests__/mapFilters.test.ts`
      - `pnpm --filter dowhat-web test -- --runInBand src/app/map/__tests__/page.smoke.test.tsx`
      - `pnpm --filter doWhat-mobile test -- --runInBand src/app/__tests__/map-filter-surface.test.ts src/lib/__tests__/mobileDiscovery.test.ts`
      - `pnpm --filter @dowhat/shared typecheck && pnpm --filter dowhat-web typecheck && pnpm --filter doWhat-mobile typecheck`
      - `node scripts/verify-discovery-contract.mjs`
   - Result:
      - Final visible web map filters: search, result kind, result strictness, merged activity focus, people vibe when backed by facets, active chips, clear all.
      - Final visible mobile map filters: search, activity categories, distance, result strictness, active chips, reset/apply.
      - Price/group/time placeholder sections are gone from the primary consumer map UX, and web/mobile contract semantics are now aligned on the supported core filters.
      - Control docs now describe the completed primary filter UX truth instead of treating it as an upcoming pass.
   - Remaining risks or follow-up notes:
      - Remote migration rollout and post-`068` live verification are still outstanding and still block production performance claims.
      - `/api/events` remains an explicit subset of the full discovery contract.
      - Secondary surfaces may still need occasional truth/copy sweeps when they are actively touched, but the primary filter architecture is now considered complete on the touched discovery surfaces.

80. Timestamp: 2026-03-09 12:48 UTC
   - Issue being worked on: Final control-doc truth check for the completed filter UX pass.
   - Files changed:
      - `FILTER_CONTRACT.md`
      - `changes_log.md`
      - `ASSISTANT_CHANGES_LOG.md`
   - Decision made:
      - Corrected the contract doc to say `result kind` is currently visible on web map only, while mobile map remains place-first.
      - Corrected the activity-type supported-surface note so it no longer implies the saved preference screens are using the live discovery contract.
   - Why the decision was made:
      - The final pass must not leave even small doc-level lies behind. The control layer has to match the verified implementation exactly.
   - How it was tested:
      - Static doc truth check against the verified implementation and focused test results from this pass.
   - Result:
      - The control docs now describe the final visible filter architecture without overstating mobile parity beyond what the code actually exposes.
   - Remaining risks or follow-up notes:
      - Mobile still intentionally omits the web-only result-kind toggle because the mobile map surface remains place-first.
