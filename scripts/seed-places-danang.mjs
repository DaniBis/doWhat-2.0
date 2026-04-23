#!/usr/bin/env node
const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;
const count = process.env.DANANG_TILE_COUNT ? Number.parseInt(process.env.DANANG_TILE_COUNT, 10) : undefined;

if (!secret) {
  console.error('CRON_SECRET must be set to authenticate the request.');
  process.exit(1);
}

const url = new URL('/api/cron/places/seed-city', BASE_URL);
url.searchParams.set('city', 'danang');
url.searchParams.set('mode', 'full');
url.searchParams.set('packs', 'parks_sports,climbing_bouldering,padel,running,yoga,chess');
url.searchParams.set('packVersion', process.env.SEED_PACK_VERSION || '2026-03-04.v1');
url.searchParams.set('refresh', '1');
url.searchParams.set('precision', '6');
if (count && Number.isFinite(count)) {
  url.searchParams.set('maxTiles', String(count));
}

(async () => {
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('Seed places request failed', response.status, text);
    process.exit(1);
  }
  const payload = await response.json();
  console.info('[seed:places:danang]', JSON.stringify(payload, null, 2));
})();
