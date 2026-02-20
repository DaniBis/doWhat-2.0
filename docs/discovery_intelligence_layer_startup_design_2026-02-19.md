# Discovery Intelligence Layer — Startup-Grade Design (2026-02-19)

## 1) Product goal

Serve the **right activity/event for the right user, at the right place/time**, with:

- low latency (p95 < 250ms API-side for cached queries),
- high place correctness (activity-place validity precision target > 95%),
- explainable ranking (debuggable score components),
- graceful degradation when enrichment providers fail,
- architecture that scales from thousands to millions of items.

---

## 2) Retrieval + ranking architecture

Use a 3-stage pipeline:

1. **Candidate Retrieval (broad, cheap)**
   - Inputs: viewport/bounds, radius, time window, auth state, hard filters.
   - Output: ~200–1000 candidates with minimal fields.
   - Sources:
     - canonical activities (must be place-backed),
     - sessions/events (location-optional for events),
     - optional inferred venue suggestions (only when policy allows).

2. **Eligibility + Quality Gating (strict)**
   - Remove items that fail invariants:
     - activities without valid canonical `place_id`,
     - stale/expired sessions,
     - blocked/spam/soft-deleted items,
     - confidence below configured threshold.

3. **Ranking (expensive, explainable)**
   - Compute a weighted score:
     - relevance (user profile/traits/category affinity),
     - proximity/travel-time,
     - freshness/time urgency,
     - social proof (engagement/conversions),
     - quality/confidence.
   - Return score breakdown + reasons for analytics and debugging.

---

## 3) Data contracts (core entities)

### `DiscoveryItem` (rankable item)

Required fields:

- `id`, `kind` (`activity` | `event`),
- `title`,
- `lat`, `lng` (nullable only for allowed event subtypes),
- `place_id` (required for `activity`),
- `starts_at`, `ends_at` (nullable for evergreen activities),
- `source`,
- `quality_confidence` (0..1),
- `dedupe_key` (stable cross-source key),
- `rank_features` (compact numeric feature vector).

### Place confidence model

For any activity-place binding store:

- `place_match_confidence` (0..1),
- `place_match_method` (`provider_exact`, `provider_near`, `manual_verified`, `fallback`),
- `place_match_distance_m`,
- `place_match_updated_at`.

Policy:

- `activity` shown only when `place_match_confidence >= ACTIVITY_PLACE_MIN_CONFIDENCE`.
- Suggested default: 0.80 initially, raise to 0.90 after backfill quality stabilizes.

---

## 4) Ranking model (v1 weighted linear)

Use a deterministic, explainable score first:

$$
S = w_r R + w_p P + w_t T + w_s S_p + w_q Q + w_b B
$$

Where:

- $R$: profile relevance (traits/categories/history),
- $P$: proximity/travel utility,
- $T$: temporal utility (soon/open now/time-window fit),
- $S_p$: social proof (attendance, saves, reliable host),
- $Q$: quality/confidence (place + content quality),
- $B$: business boost (new host cold-start, sponsored, fairness constraints).

Initial weights (example):

- `w_r=0.32`, `w_p=0.22`, `w_t=0.16`, `w_s=0.14`, `w_q=0.12`, `w_b=0.04`.

### Hard constraints before score

- If `kind=activity` and `place_id` missing -> reject.
- If user filter unsupported for source -> reject source branch or remove filter branch explicitly.
- If confidence below threshold -> reject.

### Score normalization

Each component normalized to $[0,1]$ using calibrated transforms:

- Distance: logistic decay by city density profile.
- Time: piecewise utility (`open_now` > `today` > `this_week`).
- Social: log-scaled counts to avoid popularity runaway.

---

## 5) Dedupe strategy (cross-source, map-safe)

### Dedupe keys

Build hierarchical dedupe keys:

1. `session:{session_id}` (strongest)
2. `activity:{activity_id}:place:{place_id}`
3. `external:{provider}:{external_id}`
4. fallback geo-name key: normalized name + geohash8 (only for soft dedupe)

### Merge policy

- Keep highest confidence/canonical record as primary.
- Merge fields from lower-confidence duplicates only if missing in primary.
- Preserve provenance in `merged_sources[]`.

### UI policy

- Avoid duplicate pins in same place with same activity within time bucket.
- For map clusters, dedupe **before** clustering, not after.

---

## 6) Confidence scoring (multi-factor)

### Place confidence

$$
C_{place} = 0.45 M + 0.25 D + 0.20 V + 0.10 F
$$

- $M$: name/category semantic match,
- $D$: distance confidence,
- $V$: verification trust (manual/community),
- $F$: freshness decay.

### Content confidence

- schema completeness,
- temporal validity,
- anti-spam risk,
- source reliability baseline.

Final quality:

$$
Q = 0.7 C_{place} + 0.3 C_{content}
$$

Store both raw and calibrated confidence for auditability.

---

## 7) Retrieval infrastructure for scale

### Online serving stores

- **Primary DB (Supabase/Postgres/PostGIS)** for source of truth.
- **Hot cache** (Redis-compatible) keyed by tile + filters + user segment.
- Optional **vector index** later for semantic relevance (pgvector/managed vector DB).

### Query partitioning

- geospatial tiling (geohash/H3) for cache keys and pre-aggregation,
- time partitioning for events/sessions,
- async precompute for popular tiles.

### Latency plan

- p50 from cache,
- p95 from DB retrieval + light rank,
- fallback response when enrichment unavailable (return with degraded metadata flag).

---

## 8) Feature store + offline training

### Offline feature tables

- item features (quality, confidence, popularity),
- user features (traits, category affinity, exploration profile),
- context features (city, local time, weather optional).

### Training roadmap

- v1: weighted linear (manual tuning),
- v2: LambdaMART / XGBoost ranking using click/save/join labels,
- v3: contextual bandit for exploration-exploitation.

### Counterfactual logging

Log top-k candidates + scores + shown position for every request to enable unbiased learning.

---

## 9) API design (discovery contract)

Return:

- `items[]` with `rank_score`, `confidence`, `dedupe_key`, `why_recommended[]`,
- `facets`, `filterSupport`, `sourceBreakdown`,
- `degraded`, `degradation_reason`,
- `debug` (gated to admin/dev): component scores and rejection counters.

Add optional query flags:

- `explain=true` for score breakdown,
- `strict_place=true` for hard activity place policy,
- `seed` for deterministic experiments.

---

## 10) Observability + SLOs

Track:

- retrieval count, gating reject counts by reason,
- dedupe reduction ratio,
- confidence distribution,
- CTR/save/join by rank position,
- time-to-first-meaningful-results,
- cache hit rate and stale serve rate.

SLO candidates:

- Discovery API availability: 99.9%,
- p95 latency: < 400ms uncached, < 200ms cached,
- activity-place precision: > 95% on audited sample,
- duplicate rate in top-50: < 1.5%.

---

## 11) Safety and abuse controls

- source-level trust priors,
- anomaly detection on host/event bursts,
- spam penalty feature in ranking,
- quarantine queue for low-confidence or risky items,
- per-source rate limits and circuit breakers.

---

## 12) Migration plan from current codebase

### Phase A (1–2 weeks): Contract + policy hardening

- Formalize `DiscoveryItem` with confidence and dedupe fields.
- Keep strict place-backed activity policy in serving path.
- Add structured rejection reasons (`missing_place_id`, `low_confidence`, `expired`, etc.).

### Phase B (2–4 weeks): Ranking v1 extraction

- Move scoring into dedicated module (`ranking/v1.ts`) with unit tests.
- Return score breakdown for internal `explain` mode.
- Add analytics for per-component contribution and outcome.

### Phase C (4–8 weeks): Precompute + cache scale

- Add tile-level precompute for hot geographies.
- Add Redis hot cache and adaptive TTLs.
- Add asynchronous confidence refresh jobs.

### Phase D (8+ weeks): Learning-to-rank

- Build offline dataset from exposure logs.
- Train and validate ranker; shadow deploy before full rollout.
- Introduce controlled exploration policy.

---

## 13) Minimal schema additions (recommended)

- `activity_place_confidence` table:
  - `activity_id`, `place_id`, `confidence`, `method`, `distance_m`, `verified_by`, `updated_at`.
- `discovery_exposures` table:
  - request context, top-k candidate ids/scores, chosen item, outcome signals.
- `discovery_item_features` table/materialized view:
  - cached rank features per item.

---

## 14) Experiment framework

- Feature flags for ranking versions (`rank_v1`, `rank_v2`).
- Consistent user bucketing.
- Guardrail metrics:
  - no degradation in reliability/confidence distributions,
  - no increase in duplicate or invalid-place reports,
  - stable conversion by cohort.

---

## 15) Decision summary

1. Keep strict canonical place policy for activities.
2. Use explainable ranking first, then ML ranking.
3. Dedupe with hierarchical keys and source provenance.
4. Treat confidence as first-class gating + ranking signal.
5. Invest early in exposure logging and observability for scalable iteration.
