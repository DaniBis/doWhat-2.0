import { getCityCategoryConfigMap, getCityConfig, type CityCategoryConfig } from '../config/cities';
import { defaultDiscoveryTier3Index } from '../taxonomy';
import type { DiscoveryFilterContract } from '../discovery';
import { evaluateActivityFirstDiscoveryPolicy, normalizeDiscoveryFilterContract } from '../discovery';
import type { MapCoordinates } from '../map/types';
import type { TimeWindowKey } from '../preferences/mapFilters';
import type { PlaceSummary } from './types';

type OpenStreetMapTags = Record<string, string | null | undefined>;
type OpeningFrame = Record<string, unknown>;
type StructuredHours = Record<string, unknown> & {
  timeframes?: OpeningFrame[] | null;
  isOpen?: boolean | null;
  openNow?: boolean | null;
  open_now?: boolean | null;
  is_open?: boolean | null;
};

type PlaceMetadata = Record<string, unknown> & {
  priceLevel?: number | string | null;
  price_level?: number | string | null;
  price_range?: number | string | null;
  priceCategory?: number | string | null;
  pricing?: number | string | null;
  average_price?: number | string | null;
  capacity?: number | string | null;
  maxCapacity?: number | string | null;
  max_group_size?: number | string | null;
  maxGroupSize?: number | string | null;
  groupSize?: number | string | null;
  recommendedGroupSize?: number | string | null;
  hours?: StructuredHours | null;
  popular?: { timeframes?: OpeningFrame[] | null } | null;
  timeframes?: OpeningFrame[] | null;
  openNow?: boolean | null;
  isOpen?: boolean | null;
  open_now?: boolean | null;
  is_open?: boolean | null;
  opening_hours?: string | null;
  foursquare?: {
    price?: { tier?: number | string | null } | null;
    capacity?: number | string | null;
    hours?: StructuredHours | null;
    popular?: { timeframes?: OpeningFrame[] | null } | null;
    venue?: {
      attributes?: { capacity?: number | string | null } | null;
    } | null;
  } | null;
  google_places?: {
    priceLevel?: number | string | null;
    openingHours?: { openNow?: boolean | null } | null;
  } | null;
  openstreetmap?: {
    capacity?: number | string | null;
    opening_hours?: string | null;
    tags?: OpenStreetMapTags | null;
  } | null;
};

type OpeningSegment = { start: number; end: number };

const TIME_WINDOW_OPTION_BY_KEY: Record<TimeWindowKey, { startHour?: number; endHour?: number }> = {
  any: {},
  open_now: {},
  morning: { startHour: 6, endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening: { startHour: 17, endHour: 22 },
  late: { startHour: 22, endHour: 2 },
};

const CAPACITY_OPTION_BY_KEY: Record<string, { min: number | null; max: number | null }> = {
  any: { min: null, max: null },
  couple: { min: 2, max: null },
  small: { min: 5, max: null },
  medium: { min: 8, max: null },
  large: { min: 10, max: null },
};

const normaliseCategoryKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

const toPlaceMetadata = (metadata: PlaceSummary['metadata']): PlaceMetadata | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  return metadata as PlaceMetadata;
};

const parseNumericString = (candidate: string): number | null => {
  const digits = candidate.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
};

const normalizeSet = (values?: readonly (string | null | undefined)[] | null): Set<string> => {
  const set = new Set<string>();
  (values ?? []).forEach((value) => {
    if (typeof value !== 'string') return;
    const normalized = normaliseCategoryKey(value);
    if (normalized) set.add(normalized);
  });
  return set;
};

const buildTaxonomyTagMap = () => {
  const map = new Map<string, string[]>();
  defaultDiscoveryTier3Index.forEach((entry) => {
    const tags = (entry.tags ?? []).map(normaliseCategoryKey).filter(Boolean);
    if (tags.length) {
      map.set(entry.id, tags);
    }
  });
  return map;
};

const DEFAULT_TAXONOMY_TAG_MAP = buildTaxonomyTagMap();

const isPlaceEligibleForActivityDiscovery = (place: PlaceSummary): boolean =>
  evaluateActivityFirstDiscoveryPolicy({
    name: place.name,
    description: place.description ?? null,
    categories: place.categories,
    tags: place.tags,
  }).isEligible;

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceKm = (from: MapCoordinates, to: MapCoordinates): number => {
  if ([from.lat, from.lng, to.lat, to.lng].some((value) => !Number.isFinite(value))) return Number.NaN;
  const radius = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
};

const toSearchTokens = (value: string): string[] =>
  value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);

export const placeMatchesSearchText = (place: PlaceSummary, searchText: string): boolean => {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    place.name,
    place.address ?? '',
    ...(place.categories ?? []),
    ...(place.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  if (haystack.includes(normalized)) return true;
  const tokens = toSearchTokens(normalized);
  if (!tokens.length) return true;
  return tokens.every((token) => haystack.includes(token));
};

export const resolvePlacePriceLevel = (place: PlaceSummary): number | null => {
  if (typeof place.priceLevel === 'number' && Number.isFinite(place.priceLevel)) {
    return Math.round(place.priceLevel);
  }
  const metadata = toPlaceMetadata(place.metadata);
  if (!metadata) return null;
  const candidates: Array<unknown> = [
    metadata.priceLevel,
    metadata.price_level,
    metadata.price_range,
    metadata.priceCategory,
    metadata.pricing,
    metadata.average_price,
    metadata.foursquare?.price?.tier,
    metadata.google_places?.priceLevel,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.round(candidate);
    }
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const dollarCount = trimmed.match(/\$/g)?.length ?? 0;
      if (dollarCount > 0) return dollarCount;
      const numeric = parseNumericString(trimmed);
      if (numeric != null) return Math.round(numeric);
    }
  }
  return null;
};

const parseCapacityValue = (candidate: unknown): number | null => {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return Math.round(candidate);
  if (typeof candidate === 'string') {
    const numeric = parseNumericString(candidate);
    if (numeric != null && numeric > 0) return Math.round(numeric);
  }
  return null;
};

export const resolvePlaceCapacity = (place: PlaceSummary): number | null => {
  const metadata = toPlaceMetadata(place.metadata);
  if (!metadata) return null;
  const candidates: Array<unknown> = [
    metadata.capacity,
    metadata.maxCapacity,
    metadata.max_group_size,
    metadata.maxGroupSize,
    metadata.groupSize,
    metadata.recommendedGroupSize,
    metadata.foursquare?.venue?.attributes?.capacity,
    metadata.foursquare?.capacity,
    metadata.openstreetmap?.tags?.capacity,
    metadata.openstreetmap?.capacity,
  ];
  for (const candidate of candidates) {
    const value = parseCapacityValue(candidate);
    if (value != null) return value;
  }
  return null;
};

const parseTimeToken = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{3,4}$/.test(trimmed)) {
    const padded = trimmed.padStart(4, '0');
    const hours = Number(padded.slice(0, -2));
    const minutes = Number(padded.slice(-2));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours * 60 + minutes;
    }
  }
  const match = trimmed.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours === 24) hours = 0;
  return hours * 60 + minutes;
};

const parseRenderedRange = (value: string): OpeningSegment | null => {
  const parts = value.split(/–|-/);
  if (parts.length !== 2) return null;
  const start = parseTimeToken(parts[0]);
  const end = parseTimeToken(parts[1]);
  if (start == null || end == null) return null;
  return { start, end };
};

const extractOpeningSegments = (metadata: PlaceMetadata | null | undefined): OpeningSegment[] => {
  if (!metadata) return [];
  const segments: OpeningSegment[] = [];

  const collectFromTimeframes = (timeframes?: OpeningFrame[] | null) => {
    if (!Array.isArray(timeframes)) return;
    timeframes.forEach((frame) => {
      const opens = Array.isArray(frame?.open)
        ? (frame.open as Record<string, unknown>[])
        : Array.isArray(frame?.segments)
          ? (frame.segments as Record<string, unknown>[])
          : Array.isArray(frame?.entries)
            ? (frame.entries as Record<string, unknown>[])
            : [];
      opens.forEach((entry) => {
        const start = parseTimeToken(entry.start ?? entry.startTime ?? entry.from ?? entry.begin);
        const end = parseTimeToken(entry.end ?? entry.endTime ?? entry.to ?? entry.finish);
        if (start != null && end != null) {
          segments.push({ start, end });
          return;
        }
        if (typeof entry.renderedTime === 'string') {
          const parsed = parseRenderedRange(entry.renderedTime);
          if (parsed) segments.push(parsed);
        }
      });
    });
  };

  collectFromTimeframes(metadata.hours?.timeframes);
  collectFromTimeframes(metadata.popular?.timeframes);
  collectFromTimeframes(metadata.timeframes);
  collectFromTimeframes(metadata.foursquare?.hours?.timeframes);
  collectFromTimeframes(metadata.foursquare?.popular?.timeframes);

  const openingHoursText =
    metadata.openstreetmap?.tags?.opening_hours
    ?? metadata.openstreetmap?.opening_hours
    ?? metadata.opening_hours;

  if (typeof openingHoursText === 'string') {
    openingHoursText.split(';').forEach((segmentText) => {
      const rangeMatch = segmentText.match(/(\d{1,2}[:.]\d{2}|\d{1,2})\s*[-–]\s*(\d{1,2}[:.]\d{2}|\d{1,2})/);
      if (rangeMatch) {
        const parsed = parseRenderedRange(rangeMatch[0].replace('.', ':'));
        if (parsed) segments.push(parsed);
      }
    });
  }

  return segments;
};

const doesSegmentCoverMinute = (segment: OpeningSegment, minute: number): boolean => {
  if (segment.start === segment.end) return true;
  if (segment.end > segment.start) {
    return minute >= segment.start && minute <= segment.end;
  }
  return minute >= segment.start || minute <= segment.end;
};

const isOpenAtMinute = (segments: OpeningSegment[], minute: number): boolean => {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return segments.some((segment) => doesSegmentCoverMinute(segment, normalized));
};

export const isPlaceOpenNow = (place: PlaceSummary, reference: Date): boolean | null => {
  const metadata = toPlaceMetadata(place.metadata);
  if (metadata) {
    const candidates = [
      metadata.openNow,
      metadata.isOpen,
      metadata.open_now,
      metadata.is_open,
      metadata.hours?.isOpen,
      metadata.hours?.openNow,
      metadata.hours?.open_now,
      metadata.hours?.is_open,
      metadata.foursquare?.hours?.isOpen,
      metadata.foursquare?.hours?.openNow,
      metadata.foursquare?.hours?.open_now,
      metadata.foursquare?.hours?.is_open,
      metadata.google_places?.openingHours?.openNow,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'boolean') return candidate;
    }
  }
  const segments = extractOpeningSegments(metadata);
  if (!segments.length) return null;
  const minutes = reference.getHours() * 60 + reference.getMinutes();
  return isOpenAtMinute(segments, minutes);
};

const isPlaceOpenDuringWindow = (segments: OpeningSegment[], startHour: number, endHour: number): boolean | null => {
  if (!segments.length) return null;
  const sampleMinutes: number[] = [];
  const startMinutes = ((startHour % 24) + 24) % 24 * 60;
  const endMinutes = ((endHour % 24) + 24) % 24 * 60;

  if (startHour === endHour) {
    sampleMinutes.push(startMinutes);
  } else if (startHour < endHour || endHour === 0) {
    for (let minute = startMinutes; minute <= endMinutes; minute += 60) {
      sampleMinutes.push(minute % 1440);
    }
  } else {
    for (let minute = startMinutes; minute < 1440; minute += 60) {
      sampleMinutes.push(minute);
    }
    for (let minute = 0; minute <= endMinutes; minute += 60) {
      sampleMinutes.push(minute);
    }
  }

  return sampleMinutes.some((minute) => isOpenAtMinute(segments, minute));
};

export const placeMatchesTimeWindow = (place: PlaceSummary, timeWindow: TimeWindowKey, reference: Date): boolean => {
  if (timeWindow === 'any') return true;
  if (timeWindow === 'open_now') {
    const openNow = isPlaceOpenNow(place, reference);
    return openNow ?? true;
  }
  const option = TIME_WINDOW_OPTION_BY_KEY[timeWindow];
  if (!option?.startHour) return true;
  const metadata = toPlaceMetadata(place.metadata);
  const segments = extractOpeningSegments(metadata);
  const matches = isPlaceOpenDuringWindow(segments, option.startHour, option.endHour ?? option.startHour);
  return matches ?? true;
};

const placeMatchesSelection = (
  place: PlaceSummary,
  selectionKey: string,
  categoryConfigMap: Map<string, CityCategoryConfig>,
  taxonomyTagMap: Map<string, string[]>,
): boolean => {
  const normalizedCategories = normalizeSet([...(place.categories ?? []), ...(place.tags ?? [])]);
  const placeTags = normalizeSet(place.tags ?? []);
  const config = categoryConfigMap.get(selectionKey);
  if (config) {
    const targetCategories = config.queryCategories.map(normaliseCategoryKey).filter(Boolean);
    const hasCategory = targetCategories.some((target) => normalizedCategories.has(target));
    if (hasCategory) {
      if (config.tagFilters?.length) {
        const normalizedFilters = config.tagFilters.map(normaliseCategoryKey).filter(Boolean);
        if (!normalizedFilters.some((tag) => placeTags.has(tag))) {
          return false;
        }
      }
      return true;
    }
  }

  const taxonomyTags = taxonomyTagMap.get(selectionKey) ?? [];
  if (taxonomyTags.some((tag) => normalizedCategories.has(tag) || placeTags.has(tag))) {
    return true;
  }

  const normalizedKey = normaliseCategoryKey(selectionKey);
  return normalizedCategories.has(normalizedKey) || placeTags.has(normalizedKey);
};

export interface PlaceDiscoveryFilterOptions {
  center?: MapCoordinates | null;
  now?: Date;
  citySlug?: string | null;
  categoryConfigMap?: Map<string, CityCategoryConfig>;
  taxonomyTagMap?: Map<string, string[]>;
}

export const placeMatchesDiscoveryFilters = (
  place: PlaceSummary,
  filters?: DiscoveryFilterContract | null,
  options?: PlaceDiscoveryFilterOptions,
): boolean => {
  const normalized = normalizeDiscoveryFilterContract(filters);
  const center = options?.center ?? null;
  const now = options?.now ?? new Date();
  const categoryConfigMap = options?.categoryConfigMap ?? getCityCategoryConfigMap(getCityConfig(options?.citySlug ?? undefined));
  const taxonomyTagMap = options?.taxonomyTagMap ?? DEFAULT_TAXONOMY_TAG_MAP;

  if (!isPlaceEligibleForActivityDiscovery(place)) return false;

  if (!placeMatchesSearchText(place, normalized.searchText)) return false;

  const taxonomySelections = [
    ...normalized.taxonomyCategories,
    ...normalized.activityTypes,
    ...normalized.tags,
  ];
  if (taxonomySelections.length) {
    const uniqueSelections = Array.from(new Set(taxonomySelections));
    if (!uniqueSelections.some((selection) => placeMatchesSelection(place, selection, categoryConfigMap, taxonomyTagMap))) {
      return false;
    }
  }

  if (normalized.priceLevels.length) {
    const priceLevel = resolvePlacePriceLevel(place);
    if (priceLevel != null && !normalized.priceLevels.includes(priceLevel)) {
      return false;
    }
  }

  if (normalized.maxDistanceKm != null && center) {
    const distanceKm = haversineDistanceKm(center, { lat: place.lat, lng: place.lng });
    if (Number.isFinite(distanceKm) && distanceKm > normalized.maxDistanceKm) {
      return false;
    }
  }

  if (normalized.capacityKey !== 'any') {
    const option = CAPACITY_OPTION_BY_KEY[normalized.capacityKey];
    if (option) {
      const capacity = resolvePlaceCapacity(place);
      if (capacity != null) {
        if (option.min != null && capacity < option.min) return false;
        if (option.max != null && capacity > option.max) return false;
      }
    }
  }

  if (!placeMatchesTimeWindow(place, normalized.timeWindow, now)) {
    return false;
  }

  return true;
};

export const filterPlaceSummariesByDiscoveryFilters = (
  places: readonly PlaceSummary[],
  filters?: DiscoveryFilterContract | null,
  options?: PlaceDiscoveryFilterOptions,
): PlaceSummary[] => {
  if (!places.length) return [];
  const normalized = normalizeDiscoveryFilterContract(filters);
  const noActiveFilters = !normalized.searchText
    && !normalized.activityTypes.length
    && !normalized.tags.length
    && !normalized.taxonomyCategories.length
    && !normalized.priceLevels.length
    && normalized.capacityKey === 'any'
    && normalized.timeWindow === 'any'
    && normalized.maxDistanceKm == null;
  if (noActiveFilters) {
    return places.filter((place) => isPlaceEligibleForActivityDiscovery(place));
  }
  return places.filter((place) => placeMatchesDiscoveryFilters(place, normalized, options));
};
