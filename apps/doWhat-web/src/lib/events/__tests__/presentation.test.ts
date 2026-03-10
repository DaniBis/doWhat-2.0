import type { EventSummary } from '@dowhat/shared';

import { describeEventOrigin, eventPlaceLabel } from '../presentation';

const makeEvent = (overrides: Partial<EventSummary> = {}): EventSummary => ({
  id: overrides.id ?? 'event-1',
  title: overrides.title ?? 'Open run',
  description: overrides.description ?? null,
  start_at: overrides.start_at ?? '2026-03-10T10:00:00.000Z',
  end_at: overrides.end_at ?? null,
  timezone: overrides.timezone ?? 'UTC',
  venue_name: overrides.venue_name ?? null,
  place_label: overrides.place_label ?? null,
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  address: overrides.address ?? null,
  url: overrides.url ?? null,
  image_url: overrides.image_url ?? null,
  status: overrides.status ?? 'scheduled',
  event_state: overrides.event_state ?? 'scheduled',
  reliability_score: overrides.reliability_score ?? null,
  tags: overrides.tags ?? null,
  place_id: overrides.place_id ?? null,
  source_id: overrides.source_id ?? null,
  source_uid: overrides.source_uid ?? null,
  metadata: overrides.metadata ?? null,
  place: overrides.place ?? null,
  verification_confirmations: overrides.verification_confirmations ?? null,
  verification_required: overrides.verification_required ?? null,
  origin_kind: overrides.origin_kind ?? null,
  location_kind: overrides.location_kind ?? null,
  is_place_backed: overrides.is_place_backed ?? null,
});

describe('event presentation truth', () => {
  it('labels session-origin items as community sessions', () => {
    expect(
      describeEventOrigin(
        makeEvent({
          origin_kind: 'session',
          location_kind: 'canonical_place',
          metadata: { source: 'session', sessionId: 'session-1' },
        }),
      ),
    ).toEqual({
      label: 'Community session',
      helper: 'Created on doWhat at a confirmed place',
    });
  });

  it('keeps flexible listings explicit in the location label', () => {
    expect(
      eventPlaceLabel(
        makeEvent({
          location_kind: 'flexible',
          place_label: null,
          venue_name: null,
          address: null,
        }),
      ),
    ).toBe('Location to be confirmed');
  });
});
