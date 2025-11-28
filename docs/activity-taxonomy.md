# Activity Taxonomy

A shared, three-tier activity taxonomy keeps mobile, web, and data tooling aligned. The canonical definition lives in `packages/shared/src/taxonomy/activityTaxonomy.ts` and is exported through `@dowhat/shared/taxonomy`.

## Versioning

- `activityTaxonomyVersion` holds the current semantic date string (`YYYY-MM-DD`).
- Increment the value whenever labels, hierarchy, or tags change.
- Downstream clients can compare the version against cached data to decide when to refresh filter UI or invalidate search indexes.

## Data Model

| Field | Tier | Required | Notes |
| --- | --- | --- | --- |
| `id` | 1 / 2 / 3 | ✅ | Stable, kebab-case slug. Never recycle old IDs.
| `label` | 1 / 2 / 3 | ✅ | Human readable display name.
| `description` | 1 / 2 / 3 | ✅ | Brief tooltip / CMS helper copy.
| `iconKey` | 1 / 2 (optional for 2) / 3 (optional) | ✅ for Tier1 | References an icon in `packages/shared/src/icons.ts` or the design system.
| `colorToken` | Tier1 | ✅ | Tailwind-style design token for chips/pills.
| `tags` | 1 / 2 / 3 | ✅ | Lowercase synonyms used for search + ingestion (stored once per tier node).
| `children` | 1 / 2 | ✅ | Tier1 → Tier2, Tier2 → Tier3 arrays.

Tier3 entries optionally support `defaultDurationMinutes` for future scheduling heuristics.

Helper utilities exported by `@dowhat/shared/taxonomy`:

- `activityTaxonomy`: canonical nested structure.
- `flattenTaxonomy()`: returns Tier3 entries with Tier1/Tier2 ancestry for chips, analytics, or Supabase payloads.
- `buildTagLookup()`: Map of normalized tags → Tier3 entry, useful during ingestion.
- `getTier3Category()` / `resolveTagToTier3()`: lightweight selectors powered by memoized indexes.

## Editing Workflow

1. Update `packages/shared/src/taxonomy/activityTaxonomy.ts` (keep alphabetical-ish ordering inside each tier).
2. Bump `activityTaxonomyVersion`.
3. Apply the Supabase migration (once per environment) so the backing tables exist:

```bash
SUPABASE_DB_URL=postgres://... pnpm db:migrate
```

4. Run the shared package tests:

```bash
pnpm --filter @dowhat/shared test -- activityTaxonomy.test.ts
```

5. Run the Supabase taxonomy seed script so Postgres stays in sync:

```bash
pnpm seed:taxonomy
```

Provide `DATABASE_URL` or `SUPABASE_DB_URL` in your environment before running the command.
6. Submit PR with a short changelog entry referencing affected tiers/tags.

## Analytics events

Shared helpers in `@dowhat/shared/analytics` emit consistent taxonomy events across mobile and web:

- `trackTaxonomyToggle()` → `taxonomy_category_toggle` with `{ tier3Id, active, selectionCount, platform, surface, city? }` whenever a picker pill is toggled.
- `trackTaxonomyFiltersApplied()` → `taxonomy_filters_applied` with `{ tier3Ids, platform, surface, city? }` whenever users apply/reset filters.

Hook these helpers up whenever a new surface introduces taxonomy-aware filtering so recommendation work can lean on complete telemetry.

## Runtime API access

The web app now exposes `GET /api/taxonomy` which returns `{ version, fetchedAt, taxonomy }`. The endpoint sources data from Supabase (`v_activity_taxonomy_flat` + `activity_taxonomy_state`), caches it for five minutes, and falls back to the bundled taxonomy if the database is unreachable. Clients can append `?force=true` to bypass the cache during admin workflows or smoke tests.

## Tagging Guidelines

- Tags are lowercase, hyphen-delimited (`street-food`, `run-club`).
- Include both experiential descriptors ("sunrise", "cold-plunge") and modality references ("yoga", "board-game").
- Avoid city-specific references; use neutral descriptors so the same taxonomy works globally.
- When adding a new Tier3 entry, supply at least four tags so the ingestion pipeline has enough surface area to match providers.

## Next Steps

- Add a Supabase migration + seed task that mirrors this taxonomy into `activity_categories`.
- Update the mobile/web filters to consume `@dowhat/shared/taxonomy` instead of hardcoded arrays.
- Capture analytics (e.g., Mixpanel events) that include Tier3 IDs to power recommendation work.
