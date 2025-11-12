#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const { toUpsertRecord } = require('../apps/doWhat-web/src/lib/events/dedupe');
const { parseIcsFeed } = require('../apps/doWhat-web/src/lib/events/parsers/ics');
const { computeGeoHash } = require('../apps/doWhat-web/src/lib/events/utils');

const fixturePath = resolve(process.cwd(), 'apps/doWhat-web/src/lib/events/fixtures/bangkok-demo.ics');

const source = {
  id: '00000000-0000-0000-0000-000000000000',
  url: 'https://example.com/fixtures/bangkok-demo.ics',
  type: 'ics',
  venue_hint: null,
  city: 'bangkok',
  enabled: true,
  last_fetched_at: null,
  last_status: null,
  failure_count: 0,
  fetch_interval_minutes: null,
  etag: null,
  last_modified: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function main() {
  const body = readFileSync(fixturePath, 'utf8');
  const baseline = new Date('2025-03-01T00:00:00Z');
  const events = await parseIcsFeed(source, body, baseline);
  const sample = events.slice(0, 5).map((event) => {
    const venue = {
      placeId: null,
      venueName: event.venueName ?? null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
      address: event.address ?? null,
      geohash7: computeGeoHash(event.lat ?? null, event.lng ?? null),
    };
    const record = toUpsertRecord(event, venue);
    return {
      title: record.title,
      start_at: record.start_at,
      end_at: record.end_at,
      venue_name: record.venue_name,
      lat: record.lat,
      lng: record.lng,
      tags: record.tags,
      url: record.url,
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ count: sample.length, events: sample }, null, 2));
}

main().catch((error) => {
  console.error('Dry-run ingestion failed', error);
  process.exitCode = 1;
});
