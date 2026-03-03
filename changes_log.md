# Changes Log

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
