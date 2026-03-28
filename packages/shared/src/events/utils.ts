import { normalizeDiscoveryFilterContract } from '../discovery';
import type { EventsQuery, EventSummary } from './types';
import {
  annotateEventTruth,
  buildEventDiscoveryDedupeKey,
  inferEventDiscoveryKind,
  inferEventLocationKind,
  inferEventParticipationTruth,
} from './truth';

export const sortEventsByStart = (events: EventSummary[]): EventSummary[] =>
  [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

const mergeStringLists = (left?: string[] | null, right?: string[] | null): string[] | null => {
  const merged = new Set<string>();
  [...(left ?? []), ...(right ?? [])].forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) merged.add(trimmed);
  });
  return merged.size ? Array.from(merged) : null;
};

const discoveryKindPriority = (event: EventSummary): number => {
  switch (inferEventDiscoveryKind(event)) {
    case 'session_mirror':
      return 4;
    case 'imported_event':
      return 3;
    case 'open_event':
      return 2;
    default:
      return 1;
  }
};

const locationKindPriority = (event: EventSummary): number => {
  switch (inferEventLocationKind(event)) {
    case 'canonical_place':
      return 4;
    case 'legacy_venue':
      return 3;
    case 'custom_location':
      return 2;
    case 'flexible':
      return 1;
    default:
      return 0;
  }
};

const participationPriority = (event: EventSummary): number => {
  switch (inferEventParticipationTruth(event).participation_truth_level) {
    case 'first_party':
      return 4;
    case 'linked_first_party':
      return 3;
    case 'external_source':
      return 2;
    case 'unavailable':
      return 1;
    default:
      return 0;
  }
};

const eventDiscoveryScore = (event: EventSummary): number => {
  let score = 0;
  score += discoveryKindPriority(event) * 12;
  score += locationKindPriority(event) * 4;
  score += participationPriority(event) * 5;
  if (event.place?.id || event.place_id) score += 4;
  if (event.place_label || event.venue_name || event.address) score += 2;
  if (typeof event.reliability_score === 'number' && Number.isFinite(event.reliability_score)) score += 2;
  if (typeof event.verification_confirmations === 'number') score += 1;
  if (typeof event.verification_required === 'number') score += 1;
  if (event.image_url) score += 1;
  if (event.url) score += 1;
  return score;
};

const mergeDuplicateEvents = (left: EventSummary, right: EventSummary): EventSummary => {
  const normalizedLeft = annotateEventTruth(left);
  const normalizedRight = annotateEventTruth(right);
  const preferred = eventDiscoveryScore(normalizedRight) > eventDiscoveryScore(normalizedLeft)
    ? normalizedRight
    : normalizedLeft;
  const duplicate = preferred === normalizedRight ? normalizedLeft : normalizedRight;

  return annotateEventTruth({
    ...duplicate,
    ...preferred,
    id: preferred.id,
    title: preferred.title || duplicate.title,
    description: preferred.description ?? duplicate.description ?? null,
    venue_name: preferred.venue_name ?? duplicate.venue_name ?? null,
    place_label: preferred.place_label ?? duplicate.place_label ?? null,
    lat: preferred.lat ?? duplicate.lat ?? null,
    lng: preferred.lng ?? duplicate.lng ?? null,
    address: preferred.address ?? duplicate.address ?? null,
    url: preferred.url ?? duplicate.url ?? null,
    image_url: preferred.image_url ?? duplicate.image_url ?? null,
    tags: mergeStringLists(preferred.tags, duplicate.tags),
    place_id: preferred.place_id ?? duplicate.place_id ?? null,
    source_id: preferred.source_id ?? duplicate.source_id ?? null,
    source_uid: preferred.source_uid ?? duplicate.source_uid ?? null,
    metadata: preferred.metadata ?? duplicate.metadata ?? null,
    place: preferred.place ?? duplicate.place ?? null,
    verification_confirmations: preferred.verification_confirmations ?? duplicate.verification_confirmations ?? null,
    verification_required: preferred.verification_required ?? duplicate.verification_required ?? null,
    reliability_score: preferred.reliability_score ?? duplicate.reliability_score ?? null,
  });
};

export const dedupeEventSummaries = (events: EventSummary[]): EventSummary[] => {
  const deduped = new Map<string, EventSummary>();

  events.forEach((event) => {
    const normalized = annotateEventTruth(event);
    const key = buildEventDiscoveryDedupeKey(normalized);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, normalized);
      return;
    }
    deduped.set(key, mergeDuplicateEvents(existing, normalized));
  });

  return Array.from(deduped.values());
};

export const isEventActive = (event: EventSummary, now: Date = new Date()): boolean => {
  const start = new Date(event.start_at).getTime();
  const end = event.end_at ? new Date(event.end_at).getTime() : null;
  const ts = now.getTime();
  if (Number.isNaN(start)) return false;
  if (end != null && !Number.isNaN(end)) {
    return ts >= start && ts <= end;
  }
  return ts >= start;
};

export const formatEventTimeRange = (event: EventSummary): { start: Date; end?: Date } => {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : undefined;
  return { start, end };
};

const roundCoord = (value: number | undefined) => (typeof value === 'number' ? Number(value.toFixed(6)) : null);

export const normalizeEventsQuery = (query: EventsQuery) => {
  const normalizedFilters = normalizeDiscoveryFilterContract({
    resultKinds: query.resultKinds,
    searchText: query.searchText,
    activityTypes: query.activityTypes,
    tags: [...(query.tags ?? []), ...(query.categories ?? [])],
    taxonomyCategories: query.taxonomyCategories,
    trustMode: query.trustMode ?? (query.verifiedOnly ? 'verified_only' : undefined),
  });

  return {
    sw: query.sw ? { lat: roundCoord(query.sw.lat), lng: roundCoord(query.sw.lng) } : null,
    ne: query.ne ? { lat: roundCoord(query.ne.lat), lng: roundCoord(query.ne.lng) } : null,
    from: query.from ?? null,
    to: query.to ?? null,
    limit: query.limit ?? null,
    filters: {
      resultKinds: normalizedFilters.resultKinds,
      searchText: normalizedFilters.searchText,
      activityTypes: normalizedFilters.activityTypes,
      tags: normalizedFilters.tags,
      taxonomyCategories: normalizedFilters.taxonomyCategories,
      trustMode: normalizedFilters.trustMode,
    },
    minAccuracy:
      typeof query.minAccuracy === 'number' && Number.isFinite(query.minAccuracy)
        ? Math.max(0, Math.min(100, Math.round(query.minAccuracy)))
        : null,
  } as const;
};

export const eventsQueryKey = (query: EventsQuery) => {
  const normalized = normalizeEventsQuery(query);
  return [
    'events',
    {
      sw: normalized.sw,
      ne: normalized.ne,
      from: normalized.from,
      to: normalized.to,
      resultKinds: normalized.filters.resultKinds,
      searchText: normalized.filters.searchText,
      activityTypes: normalized.filters.activityTypes,
      tags: normalized.filters.tags,
      taxonomyCategories: normalized.filters.taxonomyCategories,
      limit: normalized.limit,
      trustMode: normalized.filters.trustMode,
      minAccuracy: normalized.minAccuracy,
    },
  ] as const;
};
