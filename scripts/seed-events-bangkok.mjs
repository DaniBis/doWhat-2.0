#!/usr/bin/env node
const BASE_URL = process.env.CRON_BASE_URL || 'http://localhost:3002';
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error('CRON_SECRET must be set to authenticate the request.');
  process.exit(1);
}

(async () => {
  const response = await fetch(`${BASE_URL}/api/cron/events/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('Seed events request failed', response.status, text);
    process.exit(1);
  }
  const payload = await response.json();
  console.info('[seed:events:bangkok]', JSON.stringify(payload, null, 2));
})();
