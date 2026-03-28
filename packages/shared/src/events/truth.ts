import type {
  EventDiscoveryKind,
  EventLocationKind,
  EventOriginKind,
  EventResultKind,
  EventSummary,
  ParticipationTruthSummary,
} from './types';

const UNKNOWN_LOCATION_LABELS = new Set([
  'unknown location',
  'location to be confirmed',
  'venue tbc',
  'nearby spot',
]);

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const normalizeMeaningfulLocationLabel = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return UNKNOWN_LOCATION_LABELS.has(normalized.toLowerCase()) ? null : normalized;
};

export const isMeaningfulLocationLabel = (value: string | null | undefined): boolean =>
  normalizeMeaningfulLocationLabel(value) != null;

const readMetadataId = (
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const hasMeaningfulLocationLabel = (event: EventSummary): boolean => {
  const labels = [event.place_label, event.venue_name, event.address];
  return labels.some((value) => isMeaningfulLocationLabel(value));
};

const hasFixedCoordinates = (event: EventSummary): boolean =>
  typeof event.lat === 'number' && Number.isFinite(event.lat) && typeof event.lng === 'number' && Number.isFinite(event.lng);

const isEventDiscoveryKind = (value: unknown): value is EventDiscoveryKind =>
  value === 'session_mirror' || value === 'imported_event' || value === 'open_event';

const normalizeHttpUrl = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return null;
  return normalized;
};

export const getEventSessionId = (event: Pick<EventSummary, 'metadata'>): string | null =>
  readMetadataId(event.metadata as Record<string, unknown> | null | undefined, 'sessionId')
  ?? readMetadataId(event.metadata as Record<string, unknown> | null | undefined, 'session_id');

export const inferEventResultKind = (): EventResultKind => 'events';

export const inferEventOriginKind = (event: Pick<EventSummary, 'origin_kind' | 'metadata'>): EventOriginKind => {
  if (event.origin_kind === 'session' || event.origin_kind === 'event') {
    return event.origin_kind;
  }

  const metadata = event.metadata;
  const source = metadata && typeof metadata === 'object' ? metadata.source : null;
  const sessionId = getEventSessionId(event);

  if (source === 'session' || sessionId) {
    return 'session';
  }

  return 'event';
};

export const inferEventLocationKind = (
  event: Pick<EventSummary, 'location_kind' | 'place_id' | 'place' | 'metadata' | 'place_label' | 'venue_name' | 'address' | 'lat' | 'lng'>,
): EventLocationKind => {
  if (
    event.location_kind === 'canonical_place'
    || event.location_kind === 'legacy_venue'
    || event.location_kind === 'custom_location'
    || event.location_kind === 'flexible'
  ) {
    return event.location_kind;
  }

  if ((typeof event.place_id === 'string' && event.place_id.trim().length > 0) || event.place?.id) {
    return 'canonical_place';
  }

  const metadata = event.metadata;
  const venueId = readMetadataId(metadata, 'venueId') ?? readMetadataId(metadata, 'venue_id');
  if (venueId) {
    return 'legacy_venue';
  }

  if (hasMeaningfulLocationLabel(event as EventSummary) || hasFixedCoordinates(event as EventSummary)) {
    return 'custom_location';
  }

  return 'flexible';
};

export const isEventPlaceBacked = (
  event: Pick<EventSummary, 'is_place_backed' | 'place_id' | 'place' | 'location_kind' | 'metadata' | 'place_label' | 'venue_name' | 'address' | 'lat' | 'lng'>,
): boolean => {
  if (typeof event.is_place_backed === 'boolean') {
    return event.is_place_backed;
  }
  return inferEventLocationKind(event) === 'canonical_place';
};

export const buildFirstPartySessionParticipationTruth = (): ParticipationTruthSummary => ({
  attendance_supported: true,
  attendance_source_kind: 'session_attendance',
  first_party_attendance: true,
  rsvp_supported: true,
  verification_supported: true,
  participation_truth_level: 'first_party',
  host_kind: 'session_host',
  organizer_kind: 'dowhat_host',
});

export const buildLinkedSessionParticipationTruth = (): ParticipationTruthSummary => ({
  attendance_supported: false,
  attendance_source_kind: 'session_attendance',
  first_party_attendance: true,
  rsvp_supported: false,
  verification_supported: true,
  participation_truth_level: 'linked_first_party',
  host_kind: 'session_host',
  organizer_kind: 'dowhat_host',
});

export const buildExternalSourceParticipationTruth = (): ParticipationTruthSummary => ({
  attendance_supported: false,
  attendance_source_kind: 'external_source',
  first_party_attendance: false,
  rsvp_supported: false,
  verification_supported: false,
  participation_truth_level: 'external_source',
  host_kind: 'external_organizer',
  organizer_kind: 'external_source',
});

export const buildUnavailableParticipationTruth = (): ParticipationTruthSummary => ({
  attendance_supported: false,
  attendance_source_kind: 'none',
  first_party_attendance: false,
  rsvp_supported: false,
  verification_supported: false,
  participation_truth_level: 'unavailable',
  host_kind: 'unknown',
  organizer_kind: 'unknown',
});

const hasParticipationTruth = (value: EventSummary['participation']): value is ParticipationTruthSummary => {
  if (!value || typeof value !== 'object') return false;
  return (
    typeof value.attendance_supported === 'boolean'
    && typeof value.first_party_attendance === 'boolean'
    && typeof value.rsvp_supported === 'boolean'
    && typeof value.verification_supported === 'boolean'
    && typeof value.attendance_source_kind === 'string'
    && typeof value.participation_truth_level === 'string'
    && typeof value.host_kind === 'string'
    && typeof value.organizer_kind === 'string'
  );
};

const hasExternalSource = (
  event: Pick<EventSummary, 'metadata' | 'source_id' | 'source_uid' | 'url'>,
): boolean => {
  const metadata = event.metadata;
  const sourceUrl =
    metadata && typeof metadata === 'object' && typeof metadata.sourceUrl === 'string'
      ? normalizeHttpUrl(metadata.sourceUrl)
      : null;
  const url = normalizeHttpUrl(event.url);
  return Boolean(
    sourceUrl
    || (typeof event.source_id === 'string' && event.source_id.trim())
    || (typeof event.source_uid === 'string' && event.source_uid.trim())
    || url,
  );
};

export const inferEventDiscoveryKind = (
  event: Pick<EventSummary, 'discovery_kind' | 'origin_kind' | 'metadata' | 'source_id' | 'source_uid' | 'url'>,
): EventDiscoveryKind => {
  if (isEventDiscoveryKind(event.discovery_kind)) {
    return event.discovery_kind;
  }

  if (inferEventOriginKind(event) === 'session') {
    return 'session_mirror';
  }

  if (hasExternalSource(event)) {
    return 'imported_event';
  }

  return 'open_event';
};

export const buildEventDiscoveryDedupeKey = (
  event: Pick<EventSummary, 'discovery_dedupe_key' | 'id' | 'metadata' | 'source_id' | 'source_uid' | 'url' | 'origin_kind' | 'discovery_kind'>,
): string => {
  const existingKey = normalizeText(event.discovery_dedupe_key);
  if (existingKey) return existingKey;

  const sessionId = getEventSessionId(event);
  if (sessionId) return `session:${sessionId}`;

  const sourceId = normalizeText(event.source_id);
  const sourceUid = normalizeText(event.source_uid);
  if (sourceId && sourceUid) {
    return `source:${sourceId}:${sourceUid}`;
  }

  const kind = inferEventDiscoveryKind(event);
  return `${kind}:${event.id}`;
};

export const inferEventParticipationTruth = (
  event: Pick<EventSummary, 'participation' | 'origin_kind' | 'metadata' | 'source_id' | 'source_uid' | 'url'>,
): ParticipationTruthSummary => {
  if (hasParticipationTruth(event.participation)) {
    return event.participation;
  }

  if (inferEventOriginKind(event) === 'session') {
    return buildLinkedSessionParticipationTruth();
  }

  if (hasExternalSource(event)) {
    return buildExternalSourceParticipationTruth();
  }

  return buildUnavailableParticipationTruth();
};

export const annotateEventTruth = <T extends EventSummary>(event: T): T => ({
  ...event,
  result_kind: inferEventResultKind(),
  origin_kind: inferEventOriginKind(event),
  location_kind: inferEventLocationKind(event),
  discovery_kind: inferEventDiscoveryKind(event),
  discovery_dedupe_key: buildEventDiscoveryDedupeKey(event),
  is_place_backed: isEventPlaceBacked(event),
  participation: inferEventParticipationTruth(event),
});
