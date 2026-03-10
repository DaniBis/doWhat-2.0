#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'apps/doWhat-web/supabase/migrations');

if (!fs.existsSync(MIGRATIONS_DIR)) {
  throw new Error(`Missing migrations directory: ${MIGRATIONS_DIR}`);
}

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const migrationSources = migrationFiles
  .map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  .join('\n');

const checks = [
  {
    description: 'places keep a spatial index for canonical map discovery',
    pattern: /idx_places_geom/i,
  },
  {
    description: 'places keep GIN support for category filtering',
    pattern: /idx_places_categories/i,
  },
  {
    description: 'place tile cache keeps discovery cache GIN support',
    pattern: /idx_place_tiles_discovery_cache_gin/i,
  },
  {
    description: 'events keep a spatial index',
    pattern: /idx_events_geom/i,
  },
  {
    description: 'events keep a time index',
    pattern: /idx_events_start_at/i,
  },
  {
    description: 'events keep tag overlap GIN support',
    pattern: /idx_events_tags_gin/i,
  },
  {
    description: 'activities keep a spatial index for activities_nearby',
    pattern: /idx_activities_geom/i,
  },
  {
    description: 'activities keep activity_types overlap GIN support',
    pattern: /idx_activities_activity_types_gin/i,
  },
  {
    description: 'activities keep tags overlap GIN support',
    pattern: /idx_activities_tags_gin/i,
  },
  {
    description: 'sessions keep the composite activity/time index for upcoming-count queries',
    pattern: /idx_sessions_activity_id_starts_at/i,
  },
  {
    description: 'canonical place linkage remains indexed on activities',
    pattern: /idx_activities_place_id/i,
  },
  {
    description: 'canonical place linkage remains indexed on sessions',
    pattern: /idx_sessions_place_id/i,
  },
];

const failures = checks
  .filter((check) => !check.pattern.test(migrationSources))
  .map((check) => check.description);

if (failures.length > 0) {
  console.error('[verify-discovery-sql-contract] Failed.');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[verify-discovery-sql-contract] Passed. Discovery SQL support indexes are present in migrations.');
