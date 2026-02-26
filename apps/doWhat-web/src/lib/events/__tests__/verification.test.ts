import type { EventSourceRow, EventUpsertRecord } from '../types';
import { annotateLocationVerification, createVerificationIndex } from '../verification';

const makeSource = (id: string, url: string): EventSourceRow => ({
  id,
  url,
  type: 'rss',
  venue_hint: null,
  city: null,
  enabled: true,
  last_fetched_at: null,
  last_status: null,
  failure_count: 0,
  fetch_interval_minutes: null,
  etag: null,
  last_modified: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const makeRecord = (overrides: Partial<EventUpsertRecord> = {}): EventUpsertRecord => ({
  source_id: 'source-a',
  source_uid: 'uid-1',
  dedupe_key: 'same-event-key',
  normalized_title: 'da nang surf morning',
  title: 'Da Nang Surf Morning',
  description: null,
  tags: ['surf'],
  start_at: '2026-02-25T09:00:00.000Z',
  end_at: null,
  start_bucket: '2026-02-25T09:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  place_id: 'place-1',
  venue_name: 'My Khe Beach',
  lat: 16.067,
  lng: 108.246,
  geohash7: 'w6f4y5m',
  address: 'My Khe Beach, Da Nang',
  url: 'https://example.com/event',
  image_url: null,
  status: 'scheduled',
  event_state: 'scheduled',
  metadata: { sourceUrl: 'https://example.com/feed' },
  ...overrides,
});

describe('annotateLocationVerification', () => {
  it('marks a record as confirmed when another source matches location', () => {
    const index = createVerificationIndex();
    const sourceA = makeSource('source-a', 'https://a.example.com/feed');
    const sourceB = makeSource('source-b', 'https://b.example.com/feed');

    annotateLocationVerification([makeRecord()], sourceA, index);

    const secondRun = annotateLocationVerification(
      [
        makeRecord({
          source_id: 'source-b',
          source_uid: 'uid-2',
          lat: 16.06705,
          lng: 108.24601,
          metadata: { sourceUrl: 'https://b.example.com/feed' },
        }),
      ],
      sourceB,
      index,
    );

    const verification = (secondRun.records[0].metadata as Record<string, unknown>).locationVerification as Record<
      string,
      unknown
    >;
    expect(verification.confirmed).toBe(true);
    expect(typeof verification.accuracyScore).toBe('number');
    expect((verification.accuracyScore as number)).toBeGreaterThanOrEqual(95);
    expect(verification.confirmations).toBe(2);
    expect(secondRun.verifiedCount).toBe(1);
    expect(secondRun.pendingCount).toBe(0);
  });

  it('keeps a record pending when only one source supports the location', () => {
    const index = createVerificationIndex();
    const sourceA = makeSource('source-a', 'https://a.example.com/feed');

    const run = annotateLocationVerification([makeRecord()], sourceA, index);
    const verification = (run.records[0].metadata as Record<string, unknown>).locationVerification as Record<
      string,
      unknown
    >;

    expect(verification.confirmed).toBe(false);
    expect(verification.confirmations).toBe(1);
    expect(run.verifiedCount).toBe(0);
    expect(run.pendingCount).toBe(1);
  });
});
