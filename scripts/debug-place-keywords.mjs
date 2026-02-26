#!/usr/bin/env node
import pg from 'pg';
import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local', 'apps/doWhat-mobile/.env.local']);

const db = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!db) {
  console.error('Missing DATABASE_URL / SUPABASE_DB_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: db,
  ssl: /localhost|127\.0\.0\.1/i.test(db) ? false : { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 5000,
});

const keywordPatterns = [
  '%climb%',
  '%boulder%',
  '%roller%',
  '%skate%',
  '%horse%',
  '%equestrian%',
  '%riding%',
];

const CENTER_LAT = 13.7367;
const CENTER_LNG = 100.5231;

const withinBangkokBounds = `
  lat BETWEEN 13.45 AND 13.95
  AND lng BETWEEN 100.25 AND 100.85
`;

const placeKeywordSql = `
  SELECT
    id,
    name,
    city,
    locality,
    categories,
    tags,
    (
      6371000 * acos(
        least(
          1,
          greatest(
            -1,
            cos(radians($2)) * cos(radians(lat)) * cos(radians(lng) - radians($3))
              + sin(radians($2)) * sin(radians(lat))
          )
        )
      )
    ) AS distance_m
  FROM places
  WHERE ${withinBangkokBounds}
    AND (
      COALESCE(name, '') ILIKE ANY($1)
      OR COALESCE(description, '') ILIKE ANY($1)
      OR COALESCE(array_to_string(tags, ' '), '') ILIKE ANY($1)
      OR COALESCE(array_to_string(categories, ' '), '') ILIKE ANY($1)
    )
  ORDER BY distance_m ASC NULLS LAST
  LIMIT 80;
`;

const topCategoriesSql = `
  SELECT
    UNNEST(COALESCE(categories, '{}')) AS category,
    COUNT(*)::int AS count
  FROM places
  WHERE ${withinBangkokBounds}
  GROUP BY 1
  ORDER BY count DESC
  LIMIT 50;
`;

const activityMatchesSql = `
  SELECT
    ac.slug,
    ac.name,
    COUNT(*)::int AS matched_places
  FROM venue_activities va
  JOIN activity_catalog ac ON ac.id = va.activity_id
  JOIN places p ON p.id = va.venue_id
  WHERE ${withinBangkokBounds}
  GROUP BY ac.slug, ac.name
  ORDER BY matched_places DESC, ac.slug;
`;

try {
  const [keywordRows, topCategories, activityMatches] = await Promise.all([
    pool.query(placeKeywordSql, [keywordPatterns, CENTER_LAT, CENTER_LNG]),
    pool.query(topCategoriesSql),
    pool.query(activityMatchesSql),
  ]);

  console.log(
    JSON.stringify(
      {
        keywordPatterns,
        keywordMatchCount: keywordRows.rowCount,
        keywordSamples: keywordRows.rows.slice(0, 30),
        topCategories: topCategories.rows,
        activityMatches: activityMatches.rows,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('[debug-place-keywords] failed', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
