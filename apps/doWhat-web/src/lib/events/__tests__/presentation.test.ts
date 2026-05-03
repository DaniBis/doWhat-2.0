import type { EventSummary } from '@dowhat/shared';

import { describeEventOrigin, describeEventParticipation, describeEventPrimaryAction, eventPlaceLabel } from '../presentation';

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
      label: 'doWhat session',
      helper: 'Hosted on doWhat at a confirmed place. RSVPs stay on the session page.',
    });
  });

  it('uses a session-specific CTA for linked session mirrors', () => {
    expect(
      describeEventPrimaryAction(
        makeEvent({
          origin_kind: 'session',
          metadata: { source: 'session', sessionId: 'session-1' },
        }),
      ),
    ).toEqual({
      label: 'View session',
      secondaryLabel: null,
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

  it('keeps unlabeled custom-location listings explicit instead of using a fake venue label', () => {
    expect(
      eventPlaceLabel(
        makeEvent({
          location_kind: 'custom_location',
          place_label: null,
          venue_name: null,
          address: null,
          lat: 44.43,
          lng: 26.1,
        }),
      ),
    ).toBe('Pinned meetup point');
  });

  it('describes linked session attendance explicitly', () => {
    expect(
      describeEventParticipation(
        makeEvent({
          origin_kind: 'session',
          metadata: { source: 'session', sessionId: 'session-1' },
        }),
      ),
    ).toEqual({
      label: 'Session-managed attendance',
      helper: 'doWhat manages RSVPs and attendance on the linked session page.',
    });
  });

  it('describes source-owned attendance explicitly for imported events', () => {
    expect(
      describeEventParticipation(
        makeEvent({
          metadata: { sourceUrl: 'https://source.example/event-1' },
          source_id: 'provider',
        }),
      ),
    ).toEqual({
      label: 'Source-managed attendance',
      helper: 'RSVPs and attendance stay on the original event source.',
    });
  });

  it('uses an event CTA plus source link for imported events', () => {
    expect(
      describeEventPrimaryAction(
        makeEvent({
          metadata: { sourceUrl: 'https://source.example/event-1' },
          source_id: 'provider',
          url: 'https://source.example/event-1',
        }),
      ),
    ).toEqual({
      label: 'View event',
      secondaryLabel: 'View source',
    });
  });
});
