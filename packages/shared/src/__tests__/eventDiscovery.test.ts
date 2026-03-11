import {
  dedupeEventSummaries,
  describeEventDiscoveryPresentation,
  type EventSummary,
} from '../index';

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
  result_kind: overrides.result_kind ?? null,
  origin_kind: overrides.origin_kind ?? null,
  location_kind: overrides.location_kind ?? null,
  discovery_kind: overrides.discovery_kind ?? null,
  discovery_dedupe_key: overrides.discovery_dedupe_key ?? null,
  is_place_backed: overrides.is_place_backed ?? null,
  participation: overrides.participation ?? null,
});

describe('event discovery presentation', () => {
  it('describes linked session mirrors with a session-specific badge and CTA', () => {
    expect(
      describeEventDiscoveryPresentation(
        makeEvent({
          origin_kind: 'session',
          metadata: { source: 'session', sessionId: 'session-1' },
          location_kind: 'canonical_place',
        }),
      ),
    ).toEqual({
      badgeLabel: 'doWhat session',
      helper: 'Hosted on doWhat at a confirmed place. RSVPs stay on the session page.',
      primaryActionLabel: 'View session',
      primaryActionKind: 'view_session',
      secondaryActionLabel: null,
    });
  });

  it('describes imported listings with an external-source badge and source CTA', () => {
    expect(
      describeEventDiscoveryPresentation(
        makeEvent({
          source_id: 'provider',
          source_uid: 'abc',
          url: 'https://source.example/event',
        }),
      ),
    ).toEqual({
      badgeLabel: 'Imported event',
      helper: 'Published by an external source. Attendance stays on the source page.',
      primaryActionLabel: 'View event',
      primaryActionKind: 'view_event',
      secondaryActionLabel: 'View source',
    });
  });

  it('keeps open listings explicit when they are not first-party or imported', () => {
    expect(
      describeEventDiscoveryPresentation(
        makeEvent({
          location_kind: 'flexible',
        }),
      ),
    ).toEqual({
      badgeLabel: 'Event listing',
      helper: 'Community listing with the location still being finalized.',
      primaryActionLabel: 'View event',
      primaryActionKind: 'view_event',
      secondaryActionLabel: null,
    });
  });
});

describe('dedupeEventSummaries', () => {
  it('prefers the session mirror when a mirrored event and its source session share the same session id', () => {
    const deduped = dedupeEventSummaries([
      makeEvent({
        id: 'event-row',
        title: 'Mirror import',
        metadata: { source: 'session', sessionId: 'session-1', sourceUrl: 'https://source.example/session-1' },
        source_id: 'external-provider',
        source_uid: 'mirror-1',
      }),
      makeEvent({
        id: 'session-1',
        title: 'Real session',
        origin_kind: 'session',
        metadata: { source: 'session', sessionId: 'session-1' },
        place_id: 'place-1',
        place_label: 'Peak Climb',
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'session-1',
      title: 'Real session',
      discovery_kind: 'session_mirror',
      discovery_dedupe_key: 'session:session-1',
      place_id: 'place-1',
      place_label: 'Peak Climb',
    });
  });
});
