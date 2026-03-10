#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const rolloutDocPath = 'docs/discovery_remote_rollout_pack.md';
const checklistPath = 'docs/discovery_verification_checklist.md';
const sqlPackPath = 'scripts/sql/discovery-postdeploy-checks.sql';

const rolloutDoc = read(rolloutDocPath);
const checklistDoc = read(checklistPath);
const sqlPack = read(sqlPackPath);

const requiredMigrations = [
  '060_sessions_place_label_finalize.sql',
  '065_discovery_exposures.sql',
  '066_place_tiles_discovery_cache.sql',
  '067_activity_catalog_city_keyword_pack.sql',
  '068_discovery_query_support_indexes.sql',
];

const requiredIndexes = [
  'idx_activities_geom',
  'idx_activities_activity_types_gin',
  'idx_activities_tags_gin',
  'idx_events_tags_gin',
  'idx_sessions_activity_id_starts_at',
  'idx_place_tiles_discovery_cache_gin',
  'idx_discovery_exposures_created_at',
  'idx_discovery_exposures_request_id',
];

const requiredCommands = [
  'pnpm db:migrate',
  'node scripts/health-migrations.mjs --dowhat --strict',
  'node scripts/health-migrations.mjs --dowhat --remote-rest --strict',
  'node scripts/verify-discovery-sql-contract.mjs',
  'node scripts/verify-discovery-contract.mjs',
];

const failures = [];

for (const migration of requiredMigrations) {
  if (!rolloutDoc.includes(migration)) {
    failures.push(`${rolloutDocPath} is missing migration ${migration}`);
  }
  if (!sqlPack.includes(migration)) {
    failures.push(`${sqlPackPath} is missing migration ${migration}`);
  }
}

for (const indexName of requiredIndexes) {
  if (!sqlPack.includes(indexName)) {
    failures.push(`${sqlPackPath} is missing index check ${indexName}`);
  }
}

for (const command of requiredCommands) {
  if (!rolloutDoc.includes(command)) {
    failures.push(`${rolloutDocPath} is missing command ${command}`);
  }
}

if (!checklistDoc.includes('discovery_remote_rollout_pack.md')) {
  failures.push(`${checklistPath} no longer points to the canonical rollout pack`);
}

if (!sqlPack.includes('sessions_place_label_nonempty')) {
  failures.push(`${sqlPackPath} is missing the session place-label constraint verification`);
}

if (!rolloutDoc.includes('EXPLAIN (ANALYZE, BUFFERS)')) {
  failures.push(`${rolloutDocPath} is missing the post-deploy performance follow-up section`);
}

if (failures.length > 0) {
  console.error('[verify-discovery-rollout-pack] Failed.');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[verify-discovery-rollout-pack] Passed. Rollout docs and SQL pack cover the required discovery migration and verification steps.');
