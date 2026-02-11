import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import type { EventSourceRow } from '../events/types';
import { parseIcsFeed } from '../events/parsers/ics';
import { parseJsonLdDocument } from '../events/parsers/jsonld';

const originalFetch: typeof global.fetch | undefined = global.fetch;

const baseSource = (overrides: Partial<EventSourceRow> = {}): EventSourceRow => ({
  id: 'source-1',
  url: 'https://example.com/feed',
  type: 'ics',
  venue_hint: null,
  city: 'Bangkok',
  enabled: true,
  last_fetched_at: null,
  last_status: null,
  failure_count: 0,
  fetch_interval_minutes: null,
  etag: null,
  last_modified: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('parseIcsFeed', () => {
  test('expands recurring events and normalises fields', async () => {
    const icsBody = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:event-123\nSUMMARY:Community Run\nDESCRIPTION:Morning jog around the park\nDTSTART:20241101T060000Z\nDTEND:20241101T070000Z\nRRULE:FREQ=DAILY;COUNT=2\nLOCATION:Lumphini Park\nGEO:13.733;100.541\nSTATUS:CONFIRMED\nCATEGORIES:Outdoors,Running\nEND:VEVENT\nEND:VCALENDAR`;

    const now = new Date('2024-10-30T00:00:00Z');
    const events = await parseIcsFeed(baseSource({ type: 'ics' }), icsBody, now);

    expect(events).toHaveLength(2);
    const [first, second] = events;

    expect(first.title).toBe('Community Run');
    expect(first.status).toBe('scheduled');
    expect(first.startAt.toISOString()).toBe('2024-11-01T06:00:00.000Z');
    expect(first.endAt?.toISOString()).toBe('2024-11-01T07:00:00.000Z');
    expect(first.tags).toEqual(['outdoors', 'running']);
    expect(first.lat).toBeCloseTo(13.733, 3);
    expect(first.lng).toBeCloseTo(100.541, 3);

    expect(second.startAt.toISOString()).toBe('2024-11-02T06:00:00.000Z');
  });

  test('marks cancelled events', async () => {
    const icsBody = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:event-456\nSUMMARY:Cancelled Yoga\nDTSTART:20241105T020000Z\nDTEND:20241105T033000Z\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR`;

    const now = new Date('2024-11-01T00:00:00Z');
    const [event] = await parseIcsFeed(baseSource({ type: 'ics' }), icsBody, now);

    expect(event.status).toBe('canceled');
  });
});

describe('parseJsonLdDocument', () => {
  test('extracts schema.org Event payloads', () => {
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Bangkok Jazz Night',
      startDate: '2024-11-10T19:30:00+07:00',
      endDate: '2024-11-10T22:00:00+07:00',
      location: {
        '@type': 'Place',
        name: 'JazzBar',
        address: {
          streetAddress: '123 Sukhumvit Rd',
          addressLocality: 'Bangkok',
          addressCountry: 'TH',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 13.736,
          longitude: 100.523,
        },
      },
      description: 'Live music every Sunday.',
      image: 'https://example.com/jazz.jpg',
      url: 'https://example.com/events/jazz-night',
      eventStatus: 'EventScheduled',
      keywords: ['music', 'nightlife'],
    });

    const [event] = parseJsonLdDocument(baseSource({ type: 'jsonld' }), jsonld, 'https://example.com/events');
    expect(event.title).toBe('Bangkok Jazz Night');
    expect(event.normalizedTitle).toBe('bangkok jazz night');
    expect(event.startAt.toISOString()).toBe('2024-11-10T12:30:00.000Z');
    expect(event.endAt?.toISOString()).toBe('2024-11-10T15:00:00.000Z');
    expect(event.venueName).toBe('JazzBar');
    expect(event.lat).toBeCloseTo(13.736, 3);
    expect(event.lng).toBeCloseTo(100.523, 3);
    expect(event.tags).toEqual(expect.arrayContaining(['music', 'nightlife']));
  });
});
