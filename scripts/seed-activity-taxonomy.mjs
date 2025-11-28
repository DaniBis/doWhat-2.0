#!/usr/bin/env node
import { createRequire } from 'node:module';
import process from 'node:process';
import { Client } from 'pg';

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');

const {
  activityTaxonomy,
  activityTaxonomyVersion,
} = require('../packages/shared/src/taxonomy/activityTaxonomy');

if (!Array.isArray(activityTaxonomy) || !activityTaxonomy.length) {
  console.error('activityTaxonomy export is empty. Did you build @dowhat/shared?');
  process.exit(1);
}

if (!activityTaxonomyVersion) {
  console.error('activityTaxonomyVersion is missing.');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL or SUPABASE_DB_URL to run this script.');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

const buildRecords = () => {
  const rows = [];

  activityTaxonomy.forEach((tier1, tier1Index) => {
    rows.push({
      id: tier1.id,
      tier: 1,
      label: tier1.label,
      description: tier1.description,
      parent_id: null,
      icon_key: tier1.iconKey,
      color_token: tier1.colorToken,
      tags: tier1.tags,
      weight: tier1Index,
    });

    tier1.children.forEach((tier2, tier2Index) => {
      rows.push({
        id: tier2.id,
        tier: 2,
        label: tier2.label,
        description: tier2.description,
        parent_id: tier1.id,
        icon_key: tier2.iconKey,
        color_token: null,
        tags: tier2.tags,
        weight: tier2Index,
      });

      tier2.children.forEach((tier3, tier3Index) => {
        rows.push({
          id: tier3.id,
          tier: 3,
          label: tier3.label,
          description: tier3.description,
          parent_id: tier2.id,
          icon_key: tier3.iconKey ?? null,
          color_token: null,
          tags: tier3.tags,
          weight: tier3Index,
        });
      });
    });
  });

  return rows;
};

const UPSERT_SQL = `
  insert into public.activity_categories
    (id, tier, label, description, parent_id, icon_key, color_token, tags, weight, is_active)
  values
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
  on conflict (id) do update
    set tier = excluded.tier,
        label = excluded.label,
        description = excluded.description,
        parent_id = excluded.parent_id,
        icon_key = excluded.icon_key,
        color_token = excluded.color_token,
        tags = excluded.tags,
        weight = excluded.weight,
        is_active = true,
        updated_at = now();
`;

(async () => {
  await client.connect();

  const rows = buildRecords();
  const ids = rows.map(row => row.id);

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      await client.query(UPSERT_SQL, [
        row.id,
        row.tier,
        row.label,
        row.description,
        row.parent_id,
        row.icon_key,
        row.color_token,
        row.tags,
        row.weight,
      ]);
    }

    await client.query(
      'delete from public.activity_categories where not (id = any($1::text[]))',
      [ids],
    );

    await client.query(
      `insert into public.activity_taxonomy_state (id, version)
       values (1, $1)
       on conflict (id) do update set version = excluded.version,
       updated_at = now()`,
      [activityTaxonomyVersion],
    );

    await client.query('COMMIT');
    console.info(`[seed:taxonomy] Upserted ${rows.length} rows. Version ${activityTaxonomyVersion}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[seed:taxonomy] Failed', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
