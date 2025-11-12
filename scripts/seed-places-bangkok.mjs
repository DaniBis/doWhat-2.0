#!/usr/bin/env node
const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;
const count = process.env.BANGKOK_TILE_COUNT ? Number.parseInt(process.env.BANGKOK_TILE_COUNT, 10) : undefined;

if (!secret) {
  console.error('CRON_SECRET must be set to authenticate the request.');
  process.exit(1);
}

const url = new URL('/api/cron/places/bangkok', BASE_URL);
if (count && Number.isFinite(count)) {
  url.searchParams.set('count', String(count));
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
  console.info('[seed:places:bangkok]', JSON.stringify(payload, null, 2));
})();
