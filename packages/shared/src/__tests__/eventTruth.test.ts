import {
  annotateEventTruth,
  inferEventParticipationTruth,
  inferEventLocationKind,
  inferEventOriginKind,
  isEventPlaceBacked,
  isMeaningfulLocationLabel,
  type EventSummary,
} from '../index';

const baseEvent = (overrides: Partial<EventSummary> = {}): EventSummary => ({
  id: overrides.id ?? 'event-1',
  title: overrides.title ?? 'Community Session',
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

describe('event truth helpers', () => {
  it('marks canonical place-backed session summaries explicitly', () => {
    const event = annotateEventTruth(
      baseEvent({
        place_id: 'place-1',
        metadata: { source: 'session', sessionId: 'session-1' },
      }),
    );

    expect(inferEventOriginKind(event)).toBe('session');
    expect(inferEventLocationKind(event)).toBe('canonical_place');
    expect(isEventPlaceBacked(event)).toBe(true);
    expect(event.result_kind).toBe('events');
    expect(event.origin_kind).toBe('session');
    expect(event.location_kind).toBe('canonical_place');
    expect(event.discovery_kind).toBe('session_mirror');
    expect(event.discovery_dedupe_key).toBe('session:session-1');
    expect(event.is_place_backed).toBe(true);
    expect(event.participation).toEqual({
      attendance_supported: false,
      attendance_source_kind: 'session_attendance',
      first_party_attendance: true,
      rsvp_supported: false,
      verification_supported: true,
      participation_truth_level: 'linked_first_party',
      host_kind: 'session_host',
      organizer_kind: 'dowhat_host',
    });
  });

  it('keeps legacy venue-backed session summaries out of canonical place truth', () => {
    const event = annotateEventTruth(
      baseEvent({
        venue_name: 'Legacy Hall',
        metadata: { source: 'session', sessionId: 'session-2', venueId: 'venue-2' },
      }),
    );

    expect(event.location_kind).toBe('legacy_venue');
    expect(event.discovery_kind).toBe('session_mirror');
    expect(event.is_place_backed).toBe(false);
  });

  it('treats organizer-supplied labels or coordinates as custom location truth', () => {
    const event = annotateEventTruth(
      baseEvent({
        place_label: 'South gate meetup point',
        lat: 44.43,
        lng: 26.10,
      }),
    );

    expect(event.origin_kind).toBe('event');
    expect(event.location_kind).toBe('custom_location');
    expect(event.discovery_kind).toBe('open_event');
    expect(event.is_place_backed).toBe(false);
  });

  it('keeps flexible listings explicit instead of pretending they are venue-backed', () => {
    const event = annotateEventTruth(
      baseEvent({
        place_label: 'Nearby spot',
        venue_name: null,
        address: null,
        lat: null,
        lng: null,
      }),
    );

    expect(event.location_kind).toBe('flexible');
    expect(event.discovery_kind).toBe('open_event');
    expect(event.is_place_backed).toBe(false);
  });

  it('treats internal placeholder labels as non-meaningful location text', () => {
    expect(isMeaningfulLocationLabel('Nearby spot')).toBe(false);
    expect(isMeaningfulLocationLabel('Unknown location')).toBe(false);
    expect(isMeaningfulLocationLabel('Location to be confirmed')).toBe(false);
    expect(isMeaningfulLocationLabel('South gate meetup point')).toBe(true);
  });

  it('marks imported source events as external-source attendance', () => {
    expect(
      inferEventParticipationTruth(
        baseEvent({
          source_id: 'foursquare',
          source_uid: 'ext-1',
          metadata: { sourceUrl: 'https://source.example/event/1' },
        }),
      ),
    ).toEqual({
      attendance_supported: false,
      attendance_source_kind: 'external_source',
      first_party_attendance: false,
      rsvp_supported: false,
      verification_supported: false,
      participation_truth_level: 'external_source',
      host_kind: 'external_organizer',
      organizer_kind: 'external_source',
    });
  });

  it('marks unlabeled standalone events as attendance-unavailable', () => {
    expect(
      inferEventParticipationTruth(
        baseEvent({
          source_id: null,
          source_uid: null,
          url: null,
          metadata: null,
        }),
      ),
    ).toEqual({
      attendance_supported: false,
      attendance_source_kind: 'none',
      first_party_attendance: false,
      rsvp_supported: false,
      verification_supported: false,
      participation_truth_level: 'unavailable',
      host_kind: 'unknown',
      organizer_kind: 'unknown',
    });
  });
});
