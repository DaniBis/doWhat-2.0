import type { EventLocationKind, EventOriginKind, EventSummary } from './types';

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
  return labels.some((value) => {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    return !UNKNOWN_LOCATION_LABELS.has(normalized.toLowerCase());
  });
};

const hasFixedCoordinates = (event: EventSummary): boolean =>
  typeof event.lat === 'number' && Number.isFinite(event.lat) && typeof event.lng === 'number' && Number.isFinite(event.lng);

export const inferEventOriginKind = (event: Pick<EventSummary, 'origin_kind' | 'metadata'>): EventOriginKind => {
  if (event.origin_kind === 'session' || event.origin_kind === 'event') {
    return event.origin_kind;
  }

  const metadata = event.metadata;
  const source = metadata && typeof metadata === 'object' ? metadata.source : null;
  const sessionId = readMetadataId(metadata, 'sessionId') ?? readMetadataId(metadata, 'session_id');

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

export const annotateEventTruth = <T extends EventSummary>(event: T): T => ({
  ...event,
  origin_kind: inferEventOriginKind(event),
  location_kind: inferEventLocationKind(event),
  is_place_backed: isEventPlaceBacked(event),
});
