# doWhat Filter Contract

This file is the canonical description of discovery filter semantics.

If a user-facing filter cannot be mapped to real backend behavior, it should be removed from the UI rather than shown as a placeholder.

## Canonical Shared Contract

The shared normalized discovery contract in code is currently:

```ts
type DiscoveryFilterContract = {
  resultKinds?: ('activities' | 'events' | 'places')[];
  searchText?: string;
  activityTypes?: string[];
  tags?: string[];
  taxonomyCategories?: string[];
  priceLevels?: number[];
  capacityKey?: 'any' | 'couple' | 'small' | 'medium' | 'large';
  timeWindow?: 'any' | 'open_now' | 'morning' | 'afternoon' | 'evening' | 'late';
  maxDistanceKm?: number | null;
  peopleTraits?: string[];
  trustMode?: 'all' | 'verified_only' | 'ai_only';
  sortMode?: 'rank' | 'distance' | 'name' | 'soonest';
}
```

Defaults after normalization:

- empty arrays become `[]`
- text becomes `''`
- `capacityKey = 'any'`
- `timeWindow = 'any'`
- `maxDistanceKm = null`
- `trustMode = 'all'`
- `sortMode = 'rank'`

Important:

- The canonical contract is broader than any single consumer surface.
- A field may remain in the contract for specialized or future use while being intentionally hidden from the primary map UX if the live data is not strong enough to support honest filtering there.

## Global Semantics

- **Within a multi-select group:** OR
  - Example: selecting multiple taxonomy categories means “match any selected category”.
- **Across different groups:** AND
  - Example: text search + taxonomy + verified means the result must satisfy all active groups.
- **Hospitality-first selections**
  - Must be stripped from user-facing activity discovery filters unless the product later adds a distinct supported use case.
- **Unsupported filters**
  - Must not render as placeholders.
  - Must be removed from the visible surface until real backend support exists.

## A. WHAT

### Activity type

| Field | Meaning |
| --- | --- |
| Product meaning | Broad activity intent such as climbing, yoga, running, dance |
| Backend meaning | Matches structured activity signals used by discovery (`activity_types`, mapped activity evidence, related ranking/filter stages) |
| Supported surfaces | web map, web places, mobile map |
| Default behavior | no activity-type restriction |
| Current implementation status | supported |
| Test status | covered by shared discovery filter tests and discovery parity tests |
| Keep / remove / defer | keep |

### Result kind

| Field | Meaning |
| --- | --- |
| Product meaning | choose whether to browse activities, events, places, or a combination |
| Backend meaning | drives result-set composition and downstream filtering/ranking paths |
| Supported surfaces | web map only today |
| Default behavior | backend/client default surface behavior |
| Current implementation status | supported |
| Test status | covered by contract tests and nearby payload tests |
| Keep / remove / defer | keep |

### Search text

| Field | Meaning |
| --- | --- |
| Product meaning | free-text intent search |
| Backend meaning | normalized text search combined with structured filters |
| Supported surfaces | web map, web places, mobile map |
| Default behavior | empty text means no text restriction |
| Current implementation status | supported |
| Test status | covered in shared contract tests and discovery interaction tests |
| Keep / remove / defer | keep |

### Geo / radius / bounds

| Field | Meaning |
| --- | --- |
| Product meaning | where to search |
| Backend meaning | map bounds or radius passed into discovery endpoints, with explicit distance limits when supported |
| Supported surfaces | web map, mobile map, places discovery |
| Default behavior | current map viewport or requested nearby location |
| Current implementation status | supported, but remote migration rollout is still needed for final performance proof |
| Test status | covered by golden discovery scenarios and verification scripts |
| Keep / remove / defer | keep |

### Time relevance

| Field | Meaning |
| --- | --- |
| Product meaning | bias or restrict results by current/open or daypart relevance |
| Backend meaning | `timeWindow` contract value applied only on surfaces that can actually enforce it |
| Supported surfaces | discovery surfaces that have real hours/session timing support; do not assume `/api/events` parity yet |
| Default behavior | `any` |
| Current implementation status | partially supported by the shared contract; intentionally hidden on the primary web/mobile map surfaces today |
| Test status | covered in filter normalization and map filter regressions where present |
| Keep / remove / defer | keep only on surfaces that truly enforce it |

### Skill level

| Field | Meaning |
| --- | --- |
| Product meaning | beginner/intermediate/advanced suitability |
| Backend meaning | none consistently defined today |
| Supported surfaces | none should expose it as a real filter today |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer until schema-backed |

## B. WHO

### Traits

| Field | Meaning |
| --- | --- |
| Product meaning | people-fit or social-trait filtering when that matching is real |
| Backend meaning | `peopleTraits` in the shared contract, only where schema-backed trait matching exists |
| Supported surfaces | selected discovery surfaces; do not expose where there is no real query effect |
| Default behavior | no trait restriction |
| Current implementation status | conditionally supported |
| Test status | covered in filter normalization and parity tests where used |
| Keep / remove / defer | keep only when schema-backed on that surface |

### Reliability

| Field | Meaning |
| --- | --- |
| Product meaning | filter by reliable people or reliable hosts |
| Backend meaning | not a stable discovery filter contract today |
| Supported surfaces | none as a general discovery filter |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer |

### Play style

| Field | Meaning |
| --- | --- |
| Product meaning | casual/competitive/social style matching |
| Backend meaning | no canonical discovery field today |
| Supported surfaces | none |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer |

### Sport profile

| Field | Meaning |
| --- | --- |
| Product meaning | filter by user sport background or profile fit |
| Backend meaning | no canonical cross-surface contract today |
| Supported surfaces | none |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer |

### Availability

| Field | Meaning |
| --- | --- |
| Product meaning | filter by when people are free |
| Backend meaning | no reliable schema-backed discovery filter today |
| Supported surfaces | none |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer |

### Compatibility

| Field | Meaning |
| --- | --- |
| Product meaning | compatibility or social-fit matching between users |
| Backend meaning | none stable enough for discovery |
| Supported surfaces | none |
| Default behavior | hidden |
| Current implementation status | not supported |
| Test status | not applicable |
| Keep / remove / defer | defer |

## C. TRUST / STRICTNESS

### Verified only

| Field | Meaning |
| --- | --- |
| Product meaning | only show strongly confirmed results |
| Backend meaning | `trustMode = 'verified_only'` |
| Supported surfaces | primary web/mobile map discovery and any route honoring the canonical contract |
| Default behavior | off (`all`) |
| Current implementation status | supported in the canonical contract |
| Test status | covered in filter contract and discovery regression tests |
| Keep / remove / defer | keep |

### AI-only included / excluded

| Field | Meaning |
| --- | --- |
| Product meaning | optionally inspect AI/suggestion-first rows only |
| Backend meaning | `trustMode = 'ai_only'`; default mode is not AI-only |
| Supported surfaces | only where intentionally exposed |
| Default behavior | excluded by default unless the surface intentionally exposes that mode |
| Current implementation status | supported in the contract, but should be shown carefully |
| Test status | covered in contract normalization tests |
| Keep / remove / defer | keep as an advanced mode only |

### Has votes

| Field | Meaning |
| --- | --- |
| Product meaning | require community-vote support |
| Backend meaning | not part of the current shared canonical contract |
| Supported surfaces | not guaranteed cross-surface |
| Default behavior | hidden unless a surface has explicit real support |
| Current implementation status | not canonical |
| Test status | not canonical |
| Keep / remove / defer | defer or isolate to specialized admin/verification surfaces |

### Category match only

| Field | Meaning |
| --- | --- |
| Product meaning | require structured category evidence instead of loose keyword signal |
| Backend meaning | not exposed as a top-level shared user filter today |
| Supported surfaces | specialized verification surfaces only if intentionally implemented |
| Default behavior | hidden from primary consumer discovery |
| Current implementation status | not canonical |
| Test status | not canonical |
| Keep / remove / defer | defer from main UX |

### Keyword signal included / excluded

| Field | Meaning |
| --- | --- |
| Product meaning | control whether weak keyword inference is allowed |
| Backend meaning | internal discovery quality concern, not a primary consumer filter |
| Supported surfaces | none in standard consumer discovery |
| Default behavior | internal only |
| Current implementation status | not a supported consumer filter |
| Test status | covered indirectly through discovery behavior tests |
| Keep / remove / defer | remove from normal user-facing filters |

### Open now

| Field | Meaning |
| --- | --- |
| Product meaning | only show currently open / currently relevant results |
| Backend meaning | `timeWindow = 'open_now'`, only valid where real open-now logic exists |
| Supported surfaces | discovery surfaces with actual hours/session support |
| Default behavior | off |
| Current implementation status | conditional |
| Test status | only on surfaces where it is truly enforced |
| Keep / remove / defer | keep only where real |

### Sort mode

| Field | Meaning |
| --- | --- |
| Product meaning | explicit result ordering |
| Backend meaning | `rank`, `distance`, `name`, `soonest` |
| Supported surfaces | shared discovery surfaces |
| Default behavior | `rank` |
| Current implementation status | supported |
| Test status | covered by shared contract and ranking/order tests |
| Keep / remove / defer | keep |

## Backend Mapping Notes

- `activityTypes`, `tags`, and `taxonomyCategories` map into structured discovery filtering and ranking paths.
- `priceLevels` must map only to real source fields such as place price metadata.
- `capacityKey` and `timeWindow` are only valid when real schedule/capacity logic exists for the active surface.
- `peopleTraits` must never be treated as a cosmetic chip; if there is no real query effect, the control must not render.
- `/api/events` now supports an explicit subset of the shared contract:
  - `kind`
  - `q` / `search`
  - `types`
  - `tags`
  - `taxonomy`
  - `trust` / legacy `verifiedOnly`
  - `minAccuracy`
  - `from`, `to`, `sw`, `ne`, `limit`
- `/api/events` trust nuance:
  - `verified_only` means confirmed event rows plus first-party session-origin rows
  - `ai_only` currently means unconfirmed non-session rows, because the route does not yet have a stable cross-environment suggestion-state column
- `/api/events` payload truth:
  - consumers should use `origin_kind`, `location_kind`, and `is_place_backed` instead of inferring session/place truth from `place_id`, `venue_name`, or metadata alone
  - `place_id` is canonical place truth only; it must not be treated as a legacy venue id
- `/api/events` still does not support:
  - `peopleTraits`
  - `priceLevels`
  - `capacityKey`
  - `timeWindow`
  - `maxDistanceKm`
  - non-`soonest` sort modes
- Unsupported `/api/events` filters should fail fast instead of being silently ignored.

## Supported Surfaces Today

- **Shared canonical contract**
  - web map
  - web places
  - mobile map
- **Saved activity-preference surfaces**
  - web `/filter`
  - mobile `/filter`
  - these use `ActivityFilterPreferences`, not the live discovery contract
- **Known gap**
  - `/api/events` is aligned to an explicit subset, not the full discovery contract

## Primary Visible Filter UX

### Web `/map`

- Search by name
- Result kind (`Activities`, `Events`, `Both`)
- Result strictness
  - `All results`
  - `Confirmed only`
  - `Suggestions only`
- Activity focus
  - broad activity types/tags
  - specific categories
- People vibe
  - only when backed by real trait facets
- Active chips and clear-all
- Read-only map area context instead of a duplicate radius control

### Mobile map

- Search
- Activity categories
- Distance
- Result strictness
  - `All results`
  - `Confirmed only`
  - `Suggestions only`
- Active chips and reset/apply

### Removed from the primary map UX

- `priceLevels`
- `capacityKey`
- `timeWindow`
- placeholder “temporarily unavailable” sections
- duplicate activity/taxonomy panels

Reason:

- the current place metadata is not strong enough to support honest price/group/time filtering on the primary consumer map surfaces without misleading users when those fields are missing.

## Rules Against Duplicated Filters

- The same semantic concept must appear once per surface.
- Do not expose both a broad category filter and a duplicate taxonomy filter that mean the same thing.
- Do not expose local-only controls that do not affect the backend query.
- If a filter is advanced/internal, keep it off the consumer surface.

## Rules Against Placeholder UX

- No “temporarily unavailable” filter sections in production UI.
- No “appears when data exists” placeholder blocks.
- If facet data is absent, either:
  - render the real control with safe empty-state handling, or
  - do not render the section at all.

## Active-Chip Requirements

- Every visible active chip must correspond to a real normalized filter value.
- Chips must clear the real contract value, not just local display state.
- Chips must not claim a filter that the backend ignored.

## Reset / Clear Rules

- Reset must restore canonical defaults.
- Reset must clear URL/query-state equivalents where applicable.
- Reset must clear chips and backend query params together.

## Web / Mobile Parity Rules

- Web and mobile may differ in layout, but not in filter meaning.
- If a filter exists on one platform and not the other, that difference must be deliberate and documented.
- Current deliberate difference:
  - web exposes `result kind` because the web map is a combined activities/events surface
  - mobile map is still place-first, so it does not expose the same result-kind toggle
  - both platforms now expose the same core activity-first semantics for search, taxonomy focus, trust strictness, active chips, and reset behavior
- Shared contract normalization lives in shared code, not duplicated per client.

## Test Expectations

Any future filter change should add or update:

- normalization tests
- parsing/serialization tests
- taxonomy interaction tests
- trust filter tests
- sorting tests
- parity tests where the change affects both clients
- UI regressions if a user-facing filter surface changed
