import type { EventUpsertRecord, NormalizedEvent, VenueMatchResult, Json } from './types';
import {
  buildDedupeKey,
  cleanString,
  computeGeoHash,
  ensureTagArray,
  inferTimezone,
  roundToTenMinutes,
} from './utils';

export interface ExistingEventRow {
  id: string;
  source_id: string | null;
  source_uid: string | null;
  dedupe_key: string;
  normalized_title: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  start_at: string;
  end_at: string | null;
  start_bucket: string;
  timezone: string | null;
  place_id: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  geohash7: string | null;
  address: string | null;
  url: string | null;
  image_url: string | null;
  status: 'scheduled' | 'canceled';
  event_state?: 'scheduled' | 'canceled' | null;
  metadata: Record<string, unknown> | null;
}

export const toUpsertRecord = (
  event: NormalizedEvent,
  venue: VenueMatchResult,
): EventUpsertRecord => {
  const roundedStart = roundToTenMinutes(event.startAt);
  const lat = venue.lat ?? event.lat ?? null;
  const lng = venue.lng ?? event.lng ?? null;
  const geohash7 = venue.geohash7 ?? computeGeoHash(lat, lng);
  const dedupeKey = buildDedupeKey(event.normalizedTitle, roundedStart, venue.placeId, geohash7);
  const incomingMetadata: Record<string, Json> = {
    ...(event.metadata ?? {}),
    sourceType: event.sourceType,
    sourceUrl: event.sourceUrl,
  };

  return {
    source_id: event.sourceId,
    source_uid: event.sourceUid ?? null,
    dedupe_key: dedupeKey,
    normalized_title: event.normalizedTitle,
    title: event.title,
    description: cleanString(event.description || '') || null,
    tags: ensureTagArray(event.tags),
    start_at: event.startAt.toISOString(),
    end_at: event.endAt ? event.endAt.toISOString() : null,
    start_bucket: roundedStart.toISOString(),
    timezone: inferTimezone(event),
    place_id: venue.placeId,
    venue_name: venue.venueName ?? event.venueName ?? null,
    lat,
    lng,
    geohash7,
    address: venue.address ?? event.address ?? null,
    url: event.url ?? null,
    image_url: event.imageUrl ?? null,
    status: event.status,
    event_state: event.status,
    metadata: incomingMetadata,
  };
};

const longerDescription = (
  existing: string | null,
  incoming: string | null,
): string | null => {
  const a = cleanString(existing || '');
  const b = cleanString(incoming || '');
  if (!a) return b || null;
  if (!b) return a || null;
  return b.length > a.length ? b : a;
};

const toJsonRecord = (value: Json | undefined): Record<string, Json> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, Json>;
};

const toStringList = (value: Json | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const toFiniteNumber = (value: Json | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const chooseLocationVerification = (
  existingMetadata: Record<string, Json>,
  incomingMetadata: Record<string, Json>,
): Record<string, Json> | null => {
  const existingVerification = toJsonRecord(existingMetadata.locationVerification);
  const incomingVerification = toJsonRecord(incomingMetadata.locationVerification);

  if (!existingVerification && !incomingVerification) return null;
  if (!existingVerification) return incomingVerification;
  if (!incomingVerification) return existingVerification;

  const existingConfirmed = existingVerification.confirmed === true;
  const incomingConfirmed = incomingVerification.confirmed === true;
  if (existingConfirmed !== incomingConfirmed) {
    return existingConfirmed ? existingVerification : incomingVerification;
  }

  const existingScore = toFiniteNumber(existingVerification.accuracyScore);
  const incomingScore = toFiniteNumber(incomingVerification.accuracyScore);
  if ((existingScore ?? -1) !== (incomingScore ?? -1)) {
    return (existingScore ?? -1) > (incomingScore ?? -1) ? existingVerification : incomingVerification;
  }

  const existingConfirmations = toFiniteNumber(existingVerification.confirmations) ?? 0;
  const incomingConfirmations = toFiniteNumber(incomingVerification.confirmations) ?? 0;
  if (existingConfirmations !== incomingConfirmations) {
    return existingConfirmations > incomingConfirmations ? existingVerification : incomingVerification;
  }

  return incomingVerification;
};

export const mergeExistingEvent = (
  existing: ExistingEventRow,
  incoming: EventUpsertRecord,
): EventUpsertRecord => {
  const existingMetadata = (existing.metadata ?? {}) as Record<string, Json>;
  const incomingMetadata = incoming.metadata ?? {};
  const mergedLocationVerification = chooseLocationVerification(existingMetadata, incomingMetadata);
  const mergedEvidenceSources = Array.from(
    new Set([
      ...toStringList(existingMetadata.locationEvidenceSources),
      ...toStringList(incomingMetadata.locationEvidenceSources),
    ]),
  );
  const merged: EventUpsertRecord = {
    ...incoming,
    id: existing.id,
    source_id: incoming.source_id ?? existing.source_id,
    source_uid: incoming.source_uid ?? existing.source_uid,
    description: longerDescription(existing.description, incoming.description),
    image_url: incoming.image_url ?? existing.image_url ?? null,
    status: incoming.status === 'canceled' || existing.status === 'canceled' ? 'canceled' : 'scheduled',
    event_state:
      incoming.event_state === 'canceled' || existing.event_state === 'canceled' || existing.status === 'canceled'
        ? 'canceled'
        : 'scheduled',
    tags: ensureTagArray([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
    metadata: {
      ...existingMetadata,
      ...incomingMetadata,
      ...(mergedLocationVerification ? { locationVerification: mergedLocationVerification } : {}),
      ...(mergedEvidenceSources.length ? { locationEvidenceSources: mergedEvidenceSources } : {}),
    },
  };

  // Preserve location if existing has a confirmed place and incoming does not.
  if (existing.place_id && !incoming.place_id) {
    merged.place_id = existing.place_id;
    merged.venue_name = existing.venue_name;
    merged.lat = existing.lat;
    merged.lng = existing.lng;
    merged.geohash7 = existing.geohash7;
    merged.address = existing.address;
    if (existing.event_state) {
      merged.event_state = existing.event_state;
    }
  }

  // Ensure dedupe key unchanged.
  merged.dedupe_key = existing.dedupe_key;

  return merged;
};
