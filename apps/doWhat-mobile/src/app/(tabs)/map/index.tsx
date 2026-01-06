import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  CITY_SWITCHER_ENABLED,
  DEFAULT_CITY_SLUG,
  OPENSTREETMAP_FALLBACK_ATTRIBUTION,
  buildPlaceSavePayload,
  createEventsFetcher,
  defaultTier3Index,
  estimateRadiusFromBounds,
  fetchOverpassPlaceSummaries,
  formatEventTimeRange,
  getCityCategoryConfigMap,
  getCityConfig,
  getTier3Ids,
  isUuid,
  listCities,
  sortEventsByStart,
  trackTaxonomyFiltersApplied,
  trackTaxonomyToggle,
  useEvents,
  usePlaces,
  buildEventVerificationProgress,
  type ActivityTier3WithAncestors,
  type CityCategoryConfig,
  type CityConfig,
  type PlacesViewportQuery,
} from '@dowhat/shared';
import type { EventSummary, FetchPlaces, PlaceSummary } from '@dowhat/shared';

import MapView, { Callout, Marker, PROVIDER_GOOGLE, type MapViewProps } from 'react-native-maps';
import ngeohash from 'ngeohash';
import { useRouter } from 'expo-router';

import { geocodeLabelToCoords } from '../../../lib/geocode';
import { emitMapPlacesUpdated, subscribeProfileLocationUpdated } from '../../../lib/events';
import { buildWebUrl } from '../../../lib/web';
import {
  DEFAULT_CATEGORY_APPEARANCE,
  formatCategoryLabel,
  normaliseCategoryKey,
  resolveCategoryAppearance,
  resolvePrimaryCategoryKey,
} from '../../../lib/placeCategories';
import { supabase } from '../../../lib/supabase';
import { fetchSupabasePlacesWithinBounds } from '../../../lib/supabasePlaces';
import TaxonomyCategoryPicker from '../../../components/TaxonomyCategoryPicker';
import { useSavedActivities } from '../../../contexts/SavedActivitiesContext';

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const cityToRegion = (city: CityConfig): MapRegion => ({
  latitude: city.center.lat,
  longitude: city.center.lng,
  latitudeDelta: city.defaultRegion.latitudeDelta,
  longitudeDelta: city.defaultRegion.longitudeDelta,
});

const buildCategoryLabelMap = (city: CityConfig): Record<string, string> => {
  const map: Record<string, string> = {};
  city.enabledCategories.forEach((category) => {
    map[category.key] = category.label;
  });
  return map;
};

const buildTaxonomyTagMap = () => {
  const map = new Map<string, string[]>();
  defaultTier3Index.forEach((entry) => {
    const tags = entry.tags
      .map((tag) => normaliseCategoryKey(tag))
      .filter(Boolean);
    if (tags.length) {
      map.set(entry.id, tags);
    }
  });
  return map;
};

const parseCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const coordsApproximatelyEqual = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  epsilon = 0.0005,
) => Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;

const describeActionError = (error: unknown): string => {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message || 'Something went wrong.';
  }
  return 'Something went wrong.';
};

const getSessionIdFromMetadata = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  const candidate = record.sessionId ?? record.session_id;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

const resolveEventUrl = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  try {
    return buildWebUrl(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
  } catch {
    return null;
  }
};

const describeEventPlaceLabel = (event: EventSummary): string | null =>
  event.place_label ?? event.venue_name ?? event.address ?? 'Location to be confirmed';

const clampEventReliability = (score?: number | null): number | null => {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const describeEventReliability = (score: number | null): { label: string; helper: string; color: string } => {
  if (score == null) {
    return { label: 'New event', helper: 'Awaiting reliability data', color: 'rgba(248,250,252,0.4)' };
  }
  if (score >= 80) {
    return { label: `${score}% trusted`, helper: 'High confidence', color: '#10B981' };
  }
  if (score >= 50) {
    return { label: `${score}% trusted`, helper: 'Community signal', color: '#FBBF24' };
  }
  return { label: `${score}% trusted`, helper: 'Needs confirmations', color: '#F87171' };
};

type TimeWindowKey = 'any' | 'open_now' | 'morning' | 'afternoon' | 'evening' | 'late';

type Filters = {
  categories: string[];
  priceLevels: number[];
  maxDistanceKm: number | null;
  capacityKey: string;
  timeWindow: TimeWindowKey;
};

type CapacityOption = { key: string; label: string; min?: number | null; max?: number | null };

type TimeWindowOption = { key: TimeWindowKey; label: string; startHour?: number; endHour?: number };

type OpeningEntry = {
  start?: string | null;
  end?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  from?: string | null;
  to?: string | null;
  begin?: string | null;
  finish?: string | null;
  renderedTime?: string | null;
};

type OpeningFrame = {
  open?: OpeningEntry[] | null;
  segments?: OpeningEntry[] | null;
  entries?: OpeningEntry[] | null;
};

type StructuredHours = {
  isOpen?: boolean | null;
  openNow?: boolean | null;
  open_now?: boolean | null;
  is_open?: boolean | null;
  timeframes?: OpeningFrame[] | null;
};

type FoursquareLocation = {
  address?: string | null;
  formatted_address?: string | null;
  locality?: string | null;
  neighborhood?: string | null;
  region?: string | null;
  country?: string | null;
  postcode?: string | null;
};

type OpenStreetMapTags = Record<string, string | null | undefined>;

type PlaceMetadata = Record<string, unknown> & {
  linkedVenueId?: string | null;
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
    location?: FoursquareLocation | null;
    venue?: {
      name?: string | null;
      location?: FoursquareLocation | null;
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
    address?: string | null;
    locality?: string | null;
    region?: string | null;
    country?: string | null;
    postcode?: string | null;
    tags?: OpenStreetMapTags | null;
  } | null;
  venueId?: string | null;
  venue_id?: string | null;
  supabaseVenueId?: string | null;
  supabase_venue_id?: string | null;
  matchedVenueId?: string | null;
  venue?: { id?: string | null } | null;
  supabaseVenue?: { id?: string | null } | null;
};

const toPlaceMetadata = (metadata: PlaceSummary['metadata']): PlaceMetadata | undefined => {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata as PlaceMetadata;
};

const normaliseStringId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const extractVenueIdFromMetadata = (place: PlaceSummary | null): string | null => {
  if (!place) return null;
  const metadata = toPlaceMetadata(place.metadata);
  if (!metadata) return null;
  const candidates: Array<unknown> = [
    metadata.linkedVenueId,
    metadata.venueId,
    metadata.venue_id,
    metadata.supabaseVenueId,
    metadata.supabase_venue_id,
    metadata.matchedVenueId,
    metadata.venue?.id,
    metadata.supabaseVenue?.id,
  ];
  for (const candidate of candidates) {
    const normalized = normaliseStringId(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const resolveVenueIdForSaving = (place: PlaceSummary | null): string | null => {
  const candidate = extractVenueIdFromMetadata(place);
  if (candidate && isUuid(candidate)) {
    return candidate;
  }
  return null;
};


const DEFAULT_FILTERS: Filters = {
  categories: [],
  priceLevels: [],
  maxDistanceKm: null,
  capacityKey: 'any',
  timeWindow: 'any',
};

const PRICE_LEVEL_OPTIONS: Array<{ key: string; label: string; level: number }> = [
  { key: 'price-1', label: '$', level: 1 },
  { key: 'price-2', label: '$$', level: 2 },
  { key: 'price-3', label: '$$$', level: 3 },
  { key: 'price-4', label: '$$$$', level: 4 },
];

const DISTANCE_OPTIONS: Array<{ key: string; label: string; value: number | null }> = [
  { key: 'distance-any', label: 'Any distance', value: null },
  { key: 'distance-0_5', label: '≤ 0.5 km', value: 0.5 },
  { key: 'distance-1', label: '≤ 1 km', value: 1 },
  { key: 'distance-3', label: '≤ 3 km', value: 3 },
  { key: 'distance-5', label: '≤ 5 km', value: 5 },
  { key: 'distance-10', label: '≤ 10 km', value: 10 },
];

const CAPACITY_OPTIONS: CapacityOption[] = [
  { key: 'any', label: 'Any group size', min: null, max: null },
  { key: 'couple', label: '2+ people', min: 2, max: null },
  { key: 'small', label: '5+ people', min: 5, max: null },
  { key: 'medium', label: '8+ people', min: 8, max: null },
  { key: 'large', label: '10+ people', min: 10, max: null },
];

const TIME_WINDOW_OPTIONS: TimeWindowOption[] = [
  { key: 'any', label: 'Any time' },
  { key: 'open_now', label: 'Open now' },
  { key: 'morning', label: 'Morning', startHour: 6, endHour: 12 },
  { key: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 17 },
  { key: 'evening', label: 'Evening', startHour: 17, endHour: 22 },
  { key: 'late', label: 'Late night', startHour: 22, endHour: 2 },
];

const CAPACITY_OPTION_BY_KEY: Record<string, CapacityOption> = {};
CAPACITY_OPTIONS.forEach((option) => {
  CAPACITY_OPTION_BY_KEY[option.key] = option;
});

const TIME_WINDOW_OPTION_BY_KEY: Record<TimeWindowKey, TimeWindowOption> = {} as Record<TimeWindowKey, TimeWindowOption>;
TIME_WINDOW_OPTIONS.forEach((option) => {
  TIME_WINDOW_OPTION_BY_KEY[option.key] = option;
});

const formatCategoryName = (key: string, labelMap: Record<string, string>) => {
  if (labelMap[key]) {
    return labelMap[key];
  }
  return formatCategoryLabel(key);
};

const priceLevelLabel = (level: number) => {
  const option = PRICE_LEVEL_OPTIONS.find((candidate) => candidate.level === level);
  if (option) return option.label;
  const safeLevel = Math.min(Math.max(1, Math.round(level)), 4);
  return '$'.repeat(safeLevel);
};

const cloneFilters = (filters: Filters): Filters => ({
  categories: [...filters.categories],
  priceLevels: [...filters.priceLevels],
  maxDistanceKm: filters.maxDistanceKm,
  capacityKey: filters.capacityKey,
  timeWindow: filters.timeWindow,
});

const countActiveFilters = (filters: Filters) => {
  let count = 0;
  if (filters.categories.length) count += 1;
  if (filters.priceLevels.length) count += 1;
  if (filters.maxDistanceKm) count += 1;
  if (filters.capacityKey !== 'any') count += 1;
  if (filters.timeWindow !== 'any') count += 1;
  return count;
};

const joinWithLimit = (values: string[], limit = 3) => {
  if (values.length <= limit) return values.join(', ');
  const shown = values.slice(0, limit).join(', ');
  const remaining = values.length - limit;
  return `${shown} +${remaining}`;
};

const getFilterSummary = (filters: Filters, labelMap: Record<string, string>): string | null => {
  const parts: string[] = [];
  if (filters.categories.length) {
    const labels = filters.categories.map((key) => formatCategoryName(key, labelMap));
    parts.push(joinWithLimit(labels));
  }
  if (filters.priceLevels.length) {
    const prices = [...filters.priceLevels].sort().map((level) => priceLevelLabel(level));
    parts.push(`Price ${prices.join(', ')}`);
  }
  if (filters.maxDistanceKm) {
    const value = filters.maxDistanceKm;
    parts.push(`Within ${value} km`);
  }
  if (filters.capacityKey !== 'any') {
    const option = CAPACITY_OPTION_BY_KEY[filters.capacityKey];
    if (option) {
      parts.push(option.label);
    }
  }
  if (filters.timeWindow !== 'any') {
    const option = TIME_WINDOW_OPTION_BY_KEY[filters.timeWindow];
    if (option) {
      parts.push(option.label);
    }
  }
  if (!parts.length) return null;
  return parts.join(' · ');
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if ([lat1, lon1, lat2, lon2].some((value) => !Number.isFinite(value))) return Number.NaN;
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const parseNumericString = (candidate: string): number | null => {
  const digits = candidate.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
};

const resolvePriceLevel = (place: PlaceSummary): number | null => {
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
      const dollarMatch = trimmed.match(/\$/g);
      if (dollarMatch) {
        return dollarMatch.length;
      }
      const numeric = parseNumericString(trimmed);
      if (numeric != null) {
        return Math.round(numeric);
      }
    }
  }
  return null;
};

const parseCapacityValue = (candidate: unknown): number | null => {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.round(candidate);
  }
  if (typeof candidate === 'string') {
    const numeric = parseNumericString(candidate);
    if (numeric != null && numeric > 0) {
      return Math.round(numeric);
    }
  }
  return null;
};

const resolveCapacity = (place: PlaceSummary): number | null => {
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
    if (value != null) {
      return value;
    }
  }
  return null;
};

type OpeningSegment = { start: number; end: number };

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
        ? frame.open
        : Array.isArray(frame?.segments)
          ? frame.segments
          : Array.isArray(frame?.entries)
            ? frame.entries
            : [];
      opens.forEach((entry) => {
        const start = parseTimeToken(entry?.start ?? entry?.startTime ?? entry?.from ?? entry?.begin);
        const end = parseTimeToken(entry?.end ?? entry?.endTime ?? entry?.to ?? entry?.finish);
        if (start != null && end != null) {
          segments.push({ start, end });
          return;
        }
        if (typeof entry?.renderedTime === 'string') {
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
    metadata.openstreetmap?.tags?.opening_hours ??
    metadata.openstreetmap?.opening_hours ??
    metadata.opening_hours;
  if (typeof openingHoursText === 'string') {
    openingHoursText.split(';').forEach((segmentText: string) => {
      const rangeMatch = segmentText.match(/(\d{1,2}[:.]\d{2}|\d{1,2})\s*[-–]\s*(\d{1,2}[:.]\d{2}|\d{1,2})/);
      if (rangeMatch) {
        const parsed = parseRenderedRange(rangeMatch[0].replace('.', ':'));
        if (parsed) segments.push(parsed);
      }
    });
  }

  return segments;
};

const doesSegmentCoverMinute = (segment: OpeningSegment, minute: number) => {
  if (segment.start === segment.end) return true;
  if (segment.end > segment.start) {
    return minute >= segment.start && minute <= segment.end;
  }
  return minute >= segment.start || minute <= segment.end;
};

const isOpenAtMinute = (segments: OpeningSegment[], minute: number) => {
  const normalised = ((minute % 1440) + 1440) % 1440;
  return segments.some((segment) => doesSegmentCoverMinute(segment, normalised));
};

const isPlaceOpenNow = (place: PlaceSummary, reference: Date): boolean | null => {
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
      if (typeof candidate === 'boolean') {
        return candidate;
      }
    }
  }
  const segments = extractOpeningSegments(metadata);
  if (!segments.length) return null;
  const minutes = reference.getHours() * 60 + reference.getMinutes();
  return isOpenAtMinute(segments, minutes);
};

const isPlaceOpenDuringWindow = (segments: OpeningSegment[], startHour: number, endHour: number) => {
  if (!segments.length) return null;
  const minutesStep = 60;
  const sampleMinutes: number[] = [];
  const startMinutes = ((startHour % 24) + 24) % 24 * 60;
  const endMinutes = ((endHour % 24) + 24) % 24 * 60;

  if (startHour === endHour) {
    sampleMinutes.push(startMinutes);
  } else if (startHour < endHour || endHour === 0) {
    for (let minute = startMinutes; minute <= endMinutes; minute += minutesStep) {
      sampleMinutes.push(minute % 1440);
    }
  } else {
    for (let minute = startMinutes; minute < 1440; minute += minutesStep) {
      sampleMinutes.push(minute);
    }
    for (let minute = 0; minute <= endMinutes; minute += minutesStep) {
      sampleMinutes.push(minute);
    }
  }

  return sampleMinutes.some((minute) => isOpenAtMinute(segments, minute));
};

const placeMatchesTimeWindow = (place: PlaceSummary, timeWindow: TimeWindowKey, reference: Date) => {
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

const placeMatchesFilters = (
  place: PlaceSummary,
  filters: Filters,
  region: MapRegion,
  reference: Date,
  categoryConfigMap?: Map<string, CityCategoryConfig>,
  taxonomyTagMap?: Map<string, string[]>,
) => {
  if (filters.categories.length) {
    const normalizedCategories = new Set(
      [...(place.categories ?? []), ...(place.tags ?? [])]
        .map((value) => normaliseCategoryKey(value) ?? value.trim().toLowerCase())
        .filter(Boolean),
    );
    const placeTags = new Set(
      (place.tags ?? [])
        .map((value) => normaliseCategoryKey(value) ?? value.trim().toLowerCase())
        .filter(Boolean),
    );
    const matchesCategory = filters.categories.some((categoryKey) => {
      const config = categoryConfigMap?.get(categoryKey);
      if (config) {
        const targetCategories = config.queryCategories.map((value) => normaliseCategoryKey(value) ?? value.toLowerCase());
        const hasCategory = targetCategories.some((target) => normalizedCategories.has(target));
        if (hasCategory) {
          if (config.tagFilters?.length) {
            const normalizedFilters = config.tagFilters
              .map((value) => normaliseCategoryKey(value) ?? value.toLowerCase())
              .filter(Boolean);
            if (!normalizedFilters.some((tag) => placeTags.has(tag))) {
              return false;
            }
          }
          return true;
        }
      }

      const taxonomyTags = taxonomyTagMap?.get(categoryKey);
      if (taxonomyTags?.length) {
        const hasTaxonomyTag = taxonomyTags.some((tag) => normalizedCategories.has(tag) || placeTags.has(tag));
        if (hasTaxonomyTag) {
          return true;
        }
      }

      const normalizedKey = normaliseCategoryKey(categoryKey) ?? categoryKey.trim().toLowerCase();
      return normalizedCategories.has(normalizedKey) || placeTags.has(normalizedKey);
    });
    if (!matchesCategory) return false;
  }

  if (filters.priceLevels.length) {
    const priceLevel = resolvePriceLevel(place);
    if (priceLevel != null) {
      if (!filters.priceLevels.includes(priceLevel)) return false;
    }
  }

  if (filters.maxDistanceKm != null) {
    const distance = haversineDistanceKm(region.latitude, region.longitude, place.lat, place.lng);
    if (Number.isFinite(distance) && distance > filters.maxDistanceKm) {
      return false;
    }
  }

  if (filters.capacityKey !== 'any') {
    const option = CAPACITY_OPTION_BY_KEY[filters.capacityKey];
    if (option) {
      const capacity = resolveCapacity(place);
      if (capacity != null) {
        const min = option.min ?? null;
        const max = option.max ?? null;
        if (min != null && capacity < min) return false;
        if (max != null && capacity > max) return false;
      }
    }
  }

  if (!placeMatchesTimeWindow(place, filters.timeWindow, reference)) {
    return false;
  }

  return true;
};

const MIN_MAP_DELTA = 0.005;
const MAX_MAP_DELTA = 0.6;
const REGION_DECIMALS = 5;
const SPIDERFY_DELTA_THRESHOLD = 0.022;
const SPIDERFY_MAX_COUNT = 8;
const SPIDERFY_MIN_RADIUS = 0.00012;
const SPIDERFY_MAX_RADIUS = 0.005;

const normaliseRegion = (region: MapRegion): MapRegion => {
  const latitudeDelta = Math.min(
    Math.max(Number(region.latitudeDelta.toFixed(REGION_DECIMALS)), MIN_MAP_DELTA),
    MAX_MAP_DELTA,
  );
  const longitudeDelta = Math.min(
    Math.max(Number(region.longitudeDelta.toFixed(REGION_DECIMALS)), MIN_MAP_DELTA),
    MAX_MAP_DELTA,
  );
  return {
    latitude: Number(region.latitude.toFixed(REGION_DECIMALS)),
    longitude: Number(region.longitude.toFixed(REGION_DECIMALS)),
    latitudeDelta,
    longitudeDelta,
  };
};

const regionsApproximatelyEqual = (a: MapRegion, b: MapRegion) => {
  const epsilon = 0.00005;
  return (
    Math.abs(a.latitude - b.latitude) < epsilon &&
    Math.abs(a.longitude - b.longitude) < epsilon &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < epsilon &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < epsilon
  );
};

const boundsFromRegion = (region: MapRegion): PlacesViewportQuery['bounds'] => {
  const latSpan = region.latitudeDelta / 2;
  const lngSpan = region.longitudeDelta / 2;
  return {
    sw: { lat: region.latitude - latSpan, lng: region.longitude - lngSpan },
    ne: { lat: region.latitude + latSpan, lng: region.longitude + lngSpan },
  };
};

const getGeohashPrecisionForDelta = (latitudeDelta: number) => {
  if (latitudeDelta < 0.01) return 7;
  if (latitudeDelta < 0.03) return 6;
  if (latitudeDelta < 0.08) return 5;
  if (latitudeDelta < 0.25) return 4;
  return 3;
};

type PlaceCluster = {
  id: string;
  coordinate: { latitude: number; longitude: number };
  count: number;
  places: PlaceSummary[];
};

type RenderedPlace = {
  place: PlaceSummary;
  coordinate: { latitude: number; longitude: number };
};

const clusterPlacesForRegion = (places: PlaceSummary[], region: MapRegion) => {
  const precision = getGeohashPrecisionForDelta(region.latitudeDelta);
  const buckets = new Map<string, { places: PlaceSummary[]; sumLat: number; sumLng: number }>();

  places.forEach((place) => {
    const hash = ngeohash.encode(place.lat, place.lng, precision);
    const bucket = buckets.get(hash) ?? { places: [], sumLat: 0, sumLng: 0 };
    bucket.places.push(place);
    bucket.sumLat += place.lat;
    bucket.sumLng += place.lng;
    buckets.set(hash, bucket);
  });

  const clusters: PlaceCluster[] = [];
  const singles: RenderedPlace[] = [];

  buckets.forEach((bucket, hash) => {
    if (bucket.places.length <= 1) {
      const place = bucket.places[0];
      singles.push({
        place,
        coordinate: { latitude: place.lat, longitude: place.lng },
      });
      return;
    }
    const shouldSpiderfy =
      region.latitudeDelta < SPIDERFY_DELTA_THRESHOLD && bucket.places.length <= SPIDERFY_MAX_COUNT;

    const centerLatitude = bucket.sumLat / bucket.places.length;
    const centerLongitude = bucket.sumLng / bucket.places.length;

    if (shouldSpiderfy) {
      const sortedPlaces = [...bucket.places].sort((a, b) => a.id.localeCompare(b.id));
      const latitudeRadius = Math.min(
        Math.max(region.latitudeDelta * 0.18, SPIDERFY_MIN_RADIUS),
        SPIDERFY_MAX_RADIUS,
      );
      const longitudeRadius = Math.min(
        Math.max(region.longitudeDelta * 0.18, SPIDERFY_MIN_RADIUS),
        SPIDERFY_MAX_RADIUS,
      );

      sortedPlaces.forEach((place, index) => {
        const angle = (2 * Math.PI * index) / sortedPlaces.length;
        const latitude = centerLatitude + Math.sin(angle) * latitudeRadius;
        const longitude = centerLongitude + Math.cos(angle) * longitudeRadius;
        singles.push({
          place,
          coordinate: { latitude, longitude },
        });
      });
      return;
    }

    clusters.push({
      id: hash,
      count: bucket.places.length,
      coordinate: {
        latitude: centerLatitude,
        longitude: centerLongitude,
      },
      places: bucket.places,
    });
  });

  return { clusters, singles };
};

type AddressParts = {
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
};

const EMPTY_ADDRESS_PARTS: AddressParts = {
  address: null,
  locality: null,
  region: null,
  country: null,
  postcode: null,
};

const cleanString = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const combineAddressSegments = (...segments: Array<string | null>) => {
  const parts = segments
    .map((segment) => cleanString(segment))
    .filter((segment): segment is string => Boolean(segment));
  if (!parts.length) return null;
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const extractFoursquareAddressParts = (metadata?: PlaceMetadata | null): AddressParts => {
  if (!metadata?.foursquare) return EMPTY_ADDRESS_PARTS;
  const candidate = metadata.foursquare.venue?.location ?? metadata.foursquare.location ?? null;
  if (!candidate) return EMPTY_ADDRESS_PARTS;
  const formatted = cleanString(candidate.formatted_address);
  const streetLine = combineAddressSegments(candidate.address ?? null, candidate.neighborhood ?? null);
  return {
    address: formatted ?? streetLine,
    locality: cleanString(candidate.locality),
    region: cleanString(candidate.region),
    country: cleanString(candidate.country),
    postcode: cleanString(candidate.postcode),
  };
};

const extractOpenStreetMapAddressParts = (metadata?: PlaceMetadata | null): AddressParts => {
  if (!metadata?.openstreetmap) return EMPTY_ADDRESS_PARTS;
  const tags = metadata.openstreetmap.tags;
  const pickTag = (key: string) => {
    const value = tags?.[key];
    return typeof value === 'string' ? value : null;
  };
  const street = combineAddressSegments(pickTag('addr:housenumber'), pickTag('addr:street'));
  const fallback =
    cleanString(metadata.openstreetmap.address) ??
    street ??
    cleanString(pickTag('addr:place')) ??
    cleanString(pickTag('addr:full'));

  return {
    address: fallback,
    locality:
      cleanString(metadata.openstreetmap.locality) ??
      cleanString(
        pickTag('addr:city') ??
          pickTag('addr:town') ??
          pickTag('addr:village') ??
          pickTag('addr:municipality') ??
          pickTag('addr:suburb') ??
          pickTag('addr:neighbourhood'),
      ),
    region:
      cleanString(metadata.openstreetmap.region) ??
      cleanString(pickTag('addr:state') ?? pickTag('addr:province') ?? pickTag('is_in:state')),
    country: cleanString(metadata.openstreetmap.country) ?? cleanString(pickTag('addr:country')),
    postcode:
      cleanString(metadata.openstreetmap.postcode) ??
      cleanString(pickTag('addr:postcode') ?? pickTag('postal_code') ?? pickTag('addr:postalcode')),
  };
};

const mergeAddressParts = (...sources: AddressParts[]): AddressParts => {
  const pick = (key: keyof AddressParts) => {
    for (const source of sources) {
      const value = source[key];
      if (value) return value;
    }
    return null;
  };
  return {
    address: pick('address'),
    locality: pick('locality'),
    region: pick('region'),
    country: pick('country'),
    postcode: pick('postcode'),
  };
};

const getResolvedAddressParts = (place: PlaceSummary): AddressParts => {
  const metadata = toPlaceMetadata(place.metadata);
  const base: AddressParts = {
    address: cleanString(place.address),
    locality: cleanString(place.city ?? place.locality),
    region: cleanString(place.region),
    country: cleanString(place.country),
    postcode: cleanString(place.postcode),
  };
  const fsq = extractFoursquareAddressParts(metadata);
  const osm = extractOpenStreetMapAddressParts(metadata);
  return mergeAddressParts(base, fsq, osm);
};

const formatPlaceAddress = (place: PlaceSummary) => {
  const parts = getResolvedAddressParts(place);
  const ordered = [parts.address, parts.locality, parts.region, parts.country]
    .map((value) => cleanString(value) ?? '')
    .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);
  return ordered.length ? ordered.join(', ') : null;
};

const formatShortAddress = (place: PlaceSummary) => {
  const parts = getResolvedAddressParts(place);
  if (parts.locality) return parts.locality;
  if (parts.address) {
    const primary = parts.address.split(/[\n,]/)[0]?.trim();
    if (primary) return primary;
  }
  if (parts.region) return parts.region;
  if (parts.country) return parts.country;
  return null;
};

const GENERIC_NAME_RE = /^(unnamed|unknown|activity spot)$/i;

const resolvePlaceName = (place: PlaceSummary) => {
  const metadata = toPlaceMetadata(place.metadata);
  const fallbackCandidates: Array<string | null | undefined> = [
    metadata?.foursquare?.venue?.name,
    metadata?.foursquare && typeof (metadata.foursquare as Record<string, unknown>).name === 'string'
      ? ((metadata.foursquare as Record<string, unknown>).name as string)
      : null,
    metadata?.openstreetmap?.tags?.name,
    metadata?.openstreetmap?.tags?.['name:en'],
    metadata?.openstreetmap?.tags?.alt_name,
  ];

  const evaluate = (value?: string | null) => {
    const cleaned = cleanString(value);
    if (!cleaned) return null;
    if (GENERIC_NAME_RE.test(cleaned.toLowerCase())) return null;
    return cleaned;
  };

  const primary = evaluate(place.name);
  if (primary) return primary;
  for (const candidate of fallbackCandidates) {
    const resolved = evaluate(typeof candidate === 'string' ? candidate : null);
    if (resolved) return resolved;
  }
  return cleanString(place.name) ?? 'Activity spot';
};

const normaliseWebsiteUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const formatWebsiteHost = (value: string | null | undefined) => {
  const normalised = normaliseWebsiteUrl(value ?? null);
  if (!normalised) return null;
  try {
    const url = new URL(normalised);
    return url.host.replace(/^www\./i, '') || url.hostname;
  } catch (_error) {
    return normalised.replace(/^https?:\/\//i, '');
  }
};

export default function MapScreen() {

  const router = useRouter();
  const availableCities = useMemo(() => listCities(), []);
  const [citySlug, setCitySlug] = useState<string>(DEFAULT_CITY_SLUG);
  const city = useMemo(() => getCityConfig(citySlug), [citySlug]);
  const cityCategoryMap = useMemo(() => getCityCategoryConfigMap(city), [city]);
  const cityRegion = useMemo(() => normaliseRegion(cityToRegion(city)), [city]);
  const taxonomyIdSet = useMemo(() => new Set(getTier3Ids()), []);
  const taxonomyIndex = useMemo(() => {
    const map = new Map<string, ActivityTier3WithAncestors>();
    defaultTier3Index.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, []);
  const taxonomyTagMap = useMemo(() => buildTaxonomyTagMap(), []);
  const filterValidCategories = useCallback(
    (ids: string[]) => ids.filter((id) => taxonomyIdSet.has(id)),
    [taxonomyIdSet],
  );

  const [region, setRegion] = useState<MapRegion>(() => cityRegion);
  const [filters, setFilters] = useState<Filters>(() => cloneFilters(DEFAULT_FILTERS));
  const [draftFilters, setDraftFilters] = useState<Filters>(() => cloneFilters(DEFAULT_FILTERS));
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [attributions, setAttributions] = useState<Array<{ text: string; url?: string; license?: string }>>([]);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [profileLocation, setProfileLocation] = useState<{ lat: number; lng: number; label?: string | null } | null>(null);
  const [locationInitialized, setLocationInitialized] = useState(false);
  const { isSaved, toggle, pendingIds: savingIds } = useSavedActivities();
  const [activeVenueSessions, setActiveVenueSessions] = useState<{ upcoming: number; total: number } | null>(null);
  const [activeVenueSessionsLoading, setActiveVenueSessionsLoading] = useState(false);

  const mapRef = useRef<ComponentRef<typeof MapView> | null>(null);
  const lastRegionRef = useRef<MapRegion>(cityRegion);
  const geocodeAbortControllerRef = useRef<AbortController | null>(null);
  const lastGeocodedLabelRef = useRef<string | null>(null);
  const lastGeocodedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const profileLabelRef = useRef<string | null>(null);
  const supabaseProfileCoordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const profileUserIdRef = useRef<string | null>(null);

  const categoryLabelByKey = useMemo(() => {
    const map = buildCategoryLabelMap(city);
    defaultTier3Index.forEach((entry) => {
      map[entry.id] = entry.label;
      map[entry.tier2Id] = entry.tier2Label;
      map[entry.tier1Id] = entry.tier1Label;
    });
    return map;
  }, [city]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filterSummary = useMemo(() => getFilterSummary(filters, categoryLabelByKey), [filters, categoryLabelByKey]);
  const selectedCategoryLabels = useMemo(
    () =>
      filters.categories.map(
        (id) => taxonomyIndex.get(id)?.label ?? formatCategoryName(id, categoryLabelByKey),
      ),
    [filters.categories, taxonomyIndex, categoryLabelByKey],
  );
  const draftCategoryLabels = useMemo(
    () =>
      draftFilters.categories.map(
        (id) => taxonomyIndex.get(id)?.label ?? formatCategoryName(id, categoryLabelByKey),
      ),
    [draftFilters.categories, taxonomyIndex, categoryLabelByKey],
  );
  const selectedCategoryTags = useMemo(() => {
    const tags = new Set<string>();
    filters.categories.forEach((id) => {
      taxonomyTagMap.get(id)?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  }, [filters.categories, taxonomyTagMap]);
  const headerTitle = useMemo(() => {
    if (filters.categories.length === 1) {
      return `Discover ${formatCategoryName(filters.categories[0], categoryLabelByKey)} Places`;
    }
    return 'Discover Places';
  }, [filters.categories, categoryLabelByKey]);
  const defaultSubtitle =
    'Move the map to discover venues powered by Foursquare Places, then plan an activity there.';
  const filterSubtitle = filterSummary ? `Filters: ${filterSummary}` : null;

  const now = useMemo(() => new Date(), [filters.timeWindow]);

  const persistProfileCoords = useCallback(
    async (label: string, coords: { lat: number; lng: number }) => {
      const uid = profileUserIdRef.current;
      if (!uid) return;
      const previous = supabaseProfileCoordsRef.current;
      if (previous.lat != null && previous.lng != null) {
        if (coordsApproximatelyEqual({ lat: previous.lat, lng: previous.lng }, coords)) {
          return;
        }
      }
      try {
        await supabase
          .from('profiles')
          .update({ last_lat: coords.lat, last_lng: coords.lng })
          .eq('id', uid)
          .limit(1);
        supabaseProfileCoordsRef.current = { lat: coords.lat, lng: coords.lng };
        console.info('[Map] Synced profile coordinates for label', label);
      } catch (syncError) {
        console.info('[Map] Failed to persist corrected profile coords', syncError);
      }
    },
    [],
  );

  const requestGeocodeForLabel = useCallback(
    (label: string, options?: { force?: boolean }) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      if (!options?.force && lastGeocodedLabelRef.current === trimmed) {
        const lastServerCoords = supabaseProfileCoordsRef.current;
        const lastGeocodedCoords = lastGeocodedCoordsRef.current;
        const hasServerCoords = lastServerCoords.lat != null && lastServerCoords.lng != null;
        if (!hasServerCoords || !lastGeocodedCoords) {
          // If we do not have both values available, re-run the geocode instead of skipping.
        } else if (coordsApproximatelyEqual(lastGeocodedCoords, {
          lat: lastServerCoords.lat!,
          lng: lastServerCoords.lng!,
        })) {
          return;
        }
      }

      geocodeAbortControllerRef.current?.abort();
      const controller = new AbortController();
      geocodeAbortControllerRef.current = controller;

      (async () => {
        try {
          const coords = await geocodeLabelToCoords(trimmed, { signal: controller.signal });
          if (!coords) return;
          lastGeocodedLabelRef.current = trimmed;
          lastGeocodedCoordsRef.current = coords;
          profileLabelRef.current = trimmed;
          setProfileLocation((prev) => {
            if (
              prev &&
              Math.abs(prev.lat - coords.lat) < 1e-6 &&
              Math.abs(prev.lng - coords.lng) < 1e-6 &&
              (prev.label ?? null) === trimmed
            ) {
              return prev;
            }
            return { lat: coords.lat, lng: coords.lng, label: trimmed };
          });
          persistProfileCoords(trimmed, coords);
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') {
            return;
          }
          console.info('[Map] Profile label geocode failed', error);
        } finally {
          if (geocodeAbortControllerRef.current === controller) {
            geocodeAbortControllerRef.current = null;
          }
        }
      })();
    },
    [persistProfileCoords],
  );

  const applyProfileLocation = useCallback(
    (payload: { lat?: number | null; lng?: number | null; label?: string | null }) => {
      const nextLabel = typeof payload.label === 'string' && payload.label.trim() ? payload.label.trim() : null;
      const prevLabel = profileLabelRef.current;
      const labelChanged =
        (nextLabel ?? null) !== (prevLabel ?? null) || (nextLabel == null && prevLabel != null);
      const nextLat = parseCoordinate(payload.lat);
      const nextLng = parseCoordinate(payload.lng);
      const hasCoords = nextLat != null && nextLng != null;
      const lastGeocodedCoords = lastGeocodedCoordsRef.current;
      const mismatchWithLastGeocode =
        hasCoords &&
        lastGeocodedCoords != null &&
        !coordsApproximatelyEqual({ lat: nextLat!, lng: nextLng! }, lastGeocodedCoords);

      if (nextLabel != null) {
        profileLabelRef.current = nextLabel;
      } else if (payload.label === null) {
        profileLabelRef.current = null;
      }

      if (hasCoords) {
        setProfileLocation((prev) => {
          if (prev && prev.lat === nextLat && prev.lng === nextLng && prev.label === nextLabel) {
            return prev;
          }
          return { lat: nextLat, lng: nextLng, label: nextLabel ?? prev?.label ?? null };
        });
      } else if (nextLabel && labelChanged) {
        setProfileLocation((prev) => {
          if (!prev) return prev;
          if (prev.label === nextLabel) return prev;
          return { ...prev, label: nextLabel };
        });
      }

      if (nextLabel) {
        requestGeocodeForLabel(nextLabel, { force: !hasCoords || labelChanged || mismatchWithLastGeocode });
      }
    },
    [requestGeocodeForLabel],
  );

  const categoriesForQuery = useMemo(
    () => (filters.categories.length ? [...filters.categories] : undefined),
    [filters.categories],
  );

  const buildViewportQuery = useCallback(
    (regionOverride: MapRegion, overrides?: Partial<PlacesViewportQuery>): PlacesViewportQuery => ({
      bounds: boundsFromRegion(regionOverride),
      limit: 400,
      city: city.slug,
      ...(categoriesForQuery ? { categories: categoriesForQuery } : {}),
      ...overrides,
    }),
    [categoriesForQuery, city.slug],
  );

  const [targetQuery, setTargetQuery] = useState<PlacesViewportQuery>(() => buildViewportQuery(cityRegion));
  const [query, setQuery] = useState<PlacesViewportQuery>(() => buildViewportQuery(cityRegion));

  useEffect(() => {
    setRegion(cityRegion);
    lastRegionRef.current = cityRegion;
    const initialQuery = buildViewportQuery(cityRegion);
    setTargetQuery(initialQuery);
    setQuery(initialQuery);
  }, [cityRegion, buildViewportQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(targetQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [targetQuery]);

  useEffect(() => {
    setTargetQuery(buildViewportQuery(region));
  }, [buildViewportQuery, region]);

  useEffect(() => {
    setFilters((prev) => {
      const allowed = filterValidCategories(prev.categories);
      if (allowed.length === prev.categories.length) return prev;
      return { ...prev, categories: allowed };
    });
    setDraftFilters((prev) => {
      const allowed = filterValidCategories(prev.categories);
      if (allowed.length === prev.categories.length) return prev;
      return { ...prev, categories: allowed };
    });
  }, [filterValidCategories]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (!isMounted || !auth.session?.user?.id) return;
        profileUserIdRef.current = auth.session.user.id;
        const { data } = await supabase
          .from('profiles')
          .select('location, last_lat, last_lng')
          .eq('id', auth.session.user.id)
          .maybeSingle();
        if (!isMounted || !data) return;
        supabaseProfileCoordsRef.current = {
          lat: typeof data.last_lat === 'number' ? data.last_lat : null,
          lng: typeof data.last_lng === 'number' ? data.last_lng : null,
        };
        applyProfileLocation({
          lat: data.last_lat,
          lng: data.last_lng,
          label: typeof data.location === 'string' ? data.location : null,
        });
      } catch (err) {
        console.warn('Failed to fetch profile location', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [applyProfileLocation]);

  useEffect(() => {
    const subscription = subscribeProfileLocationUpdated((payload) => {
      applyProfileLocation(payload);
    });
    return () => subscription.remove();
  }, [applyProfileLocation]);

  useEffect(() => () => {
    geocodeAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (!isMounted) return;
        let centerLat: number;
        let centerLng: number;
        if (profileLocation) {
          centerLat = profileLocation.lat;
          centerLng = profileLocation.lng;
        } else if (existing.status === 'granted') {
          setHasLocationPermission(true);
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (isMounted && position) {
            centerLat = position.coords.latitude;
            centerLng = position.coords.longitude;
          } else {
            centerLat = cityRegion.latitude;
            centerLng = cityRegion.longitude;
          }
        } else {
          const requested = await Location.requestForegroundPermissionsAsync();
          if (!isMounted) return;
          if (requested.status === 'granted') {
            setHasLocationPermission(true);
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (isMounted && position) {
              centerLat = position.coords.latitude;
              centerLng = position.coords.longitude;
            } else {
              centerLat = cityRegion.latitude;
              centerLng = cityRegion.longitude;
            }
          } else {
            setHasLocationPermission(false);
            centerLat = cityRegion.latitude;
            centerLng = cityRegion.longitude;
          }
        }
        if (isMounted && !locationInitialized) {
          const nextRegion: MapRegion = {
            latitude: centerLat,
            longitude: centerLng,
            latitudeDelta: Math.max(cityRegion.latitudeDelta * 0.4, MIN_MAP_DELTA),
            longitudeDelta: Math.max(cityRegion.longitudeDelta * 0.4, MIN_MAP_DELTA),
          };
          setRegion(nextRegion);
          lastRegionRef.current = nextRegion;
          setTargetQuery(buildViewportQuery(nextRegion));
          setLocationInitialized(true);
        }
      } catch (err) {
        if (isMounted && !locationInitialized) {
          console.warn('Location setup error', err);
          setHasLocationPermission(false);
          // Fallback to profile or city
          const centerLat = profileLocation?.lat ?? cityRegion.latitude;
          const centerLng = profileLocation?.lng ?? cityRegion.longitude;
          const nextRegion: MapRegion = {
            latitude: centerLat,
            longitude: centerLng,
            latitudeDelta: Math.max(cityRegion.latitudeDelta * 0.4, MIN_MAP_DELTA),
            longitudeDelta: Math.max(cityRegion.longitudeDelta * 0.4, MIN_MAP_DELTA),
          };
          setRegion(nextRegion);
          lastRegionRef.current = nextRegion;
          setTargetQuery(buildViewportQuery(nextRegion));
          setLocationInitialized(true);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [buildViewportQuery, cityRegion, profileLocation, locationInitialized]);

  useEffect(() => {
    if (locationInitialized && mapRef.current) {
      // Ensure map is centered on the correct location after initialization
      // Removed animateToRegion since region prop handles it
    }
  }, [locationInitialized]);

  // Update map to profile location if it becomes available after initialization
  useEffect(() => {
    if (locationInitialized && profileLocation) {
      const profileRegion: MapRegion = {
        latitude: profileLocation.lat,
        longitude: profileLocation.lng,
        latitudeDelta: Math.max(cityRegion.latitudeDelta * 0.4, MIN_MAP_DELTA),
        longitudeDelta: Math.max(cityRegion.longitudeDelta * 0.4, MIN_MAP_DELTA),
      };
      setRegion(profileRegion);
      lastRegionRef.current = profileRegion;
      setTargetQuery(buildViewportQuery(profileRegion));
      // Removed animateToRegion since region prop handles animation
    }
  }, [profileLocation, locationInitialized, cityRegion, buildViewportQuery]);

  const supabasePlacesFetcher = useMemo<FetchPlaces>(() => {
    return async ({ bounds, limit, city: queryCity, signal }) => {
      const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      const citySlugForQuery = queryCity ?? city.slug ?? DEFAULT_CITY_SLUG;
      try {
        const places = await fetchSupabasePlacesWithinBounds({
          bounds,
          citySlug: citySlugForQuery,
          limit: limit ?? 400,
        });
        const latencyMs = Math.round(
          (typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now()) - startedAt,
        );
        const providerCounts: Record<string, number> = { supabase: places.length };
        return {
          cacheHit: true,
          places,
          providerCounts,
          attribution: [],
          latencyMs,
        };
      } catch (primaryError) {
        if (__DEV__) {
          console.warn('[Map] Supabase places fetch failed', primaryError);
        }
        const centerLat = (bounds.ne.lat + bounds.sw.lat) / 2;
        const centerLng = (bounds.ne.lng + bounds.sw.lng) / 2;
        const fallbackRadius = estimateRadiusFromBounds(bounds);
        try {
          const fallbackPlaces = await fetchOverpassPlaceSummaries({
            lat: centerLat,
            lng: centerLng,
            radiusMeters: fallbackRadius,
            limit: limit ?? 400,
            signal,
          });
          const latencyMs = Math.round(
            (typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now()) - startedAt,
          );
          const providerCounts: Record<string, number> = { openstreetmap: fallbackPlaces.length };
          return {
            cacheHit: false,
            places: fallbackPlaces,
            providerCounts,
            attribution: [OPENSTREETMAP_FALLBACK_ATTRIBUTION],
            latencyMs,
          };
        } catch (fallbackError) {
          if (__DEV__) {
            console.warn('[Map] Places fallback failed', fallbackError);
          }
          throw primaryError instanceof Error
            ? primaryError
            : new Error('Unable to load nearby places.');
        }
      }
    };
  }, [city.slug]);

  const placesQuery = usePlaces(query, {
    fetcher: supabasePlacesFetcher,
    enabled: Boolean(query),
    staleTime: 2 * 60_000,
  });

  const loading = placesQuery.isFetching;
  const error = placesQuery.error?.message ?? null;
  const friendlyError = error ? error.replace(/^TypeError:\s*/i, '').trim() || null : null;
  const places = placesQuery.data?.places ?? [];

  const eventsFetcher = useMemo(
    () =>
      createEventsFetcher({
        buildUrl: () => buildWebUrl('/api/events'),
        includeCredentials: true,
      }),
    [],
  );

  const eventsWindow = useMemo(() => {
    const start = new Date();
    const daysAhead = 14;
    const end = new Date(start.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const eventsQueryArgs = useMemo(() => {
    if (!query?.bounds) return null;
    return {
      sw: query.bounds.sw,
      ne: query.bounds.ne,
      from: eventsWindow.from,
      to: eventsWindow.to,
      limit: 150,
    };
  }, [eventsWindow, query]);

  const eventsQuery = useEvents(eventsQueryArgs, {
    fetcher: eventsFetcher,
    enabled: Boolean(eventsQueryArgs),
    staleTime: 60_000,
  });

  const events = useMemo(() => sortEventsByStart(eventsQuery.data?.events ?? []), [eventsQuery.data?.events]);
  const eventHighlights = useMemo(() => events.slice(0, 6), [events]);

  const eventTimeFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, []);

  const describeEventTime = useCallback(
    (eventSummary: EventSummary) => {
      const { start: startDate, end: endDate } = formatEventTimeRange(eventSummary);
      const formatValue = (value: Date) => {
        if (eventTimeFormatter) {
          return eventTimeFormatter.format(value);
        }
        return value.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
      };
      const startLabel = formatValue(startDate);
      return endDate ? `${startLabel} · ${formatValue(endDate)}` : startLabel;
    },
    [eventTimeFormatter],
  );

  const handleOpenEvent = useCallback(
    (eventSummary: EventSummary) => {
      const sessionId = getSessionIdFromMetadata(eventSummary.metadata);
      if (sessionId) {
        router.push({ pathname: '/sessions/[id]', params: { id: sessionId } });
        return;
      }
      const targetUrl = resolveEventUrl(eventSummary.url);
      if (targetUrl) {
        void Linking.openURL(targetUrl);
      }
    },
    [router],
  );

  useEffect(() => {
    if (placesQuery.data?.attribution) {
      setAttributions(placesQuery.data.attribution);
    }
  }, [placesQuery.data?.attribution]);

  const handleRegionChangeComplete: MapViewProps['onRegionChangeComplete'] = (nextRegion) => {
    const normalised = normaliseRegion(nextRegion);
    const lastRegion = lastRegionRef.current;
    if (lastRegion && regionsApproximatelyEqual(lastRegion, normalised)) {
      return;
    }
    lastRegionRef.current = normalised;
    setRegion(normalised);
    setTargetQuery(buildViewportQuery(normalised));
  };

  const deferredRegion = useDeferredValue(region);

  const filteredPlaces = useMemo(
    () =>
      places.filter((place) =>
        placeMatchesFilters(place, filters, deferredRegion, now, cityCategoryMap, taxonomyTagMap),
      ),
    [places, filters, deferredRegion, now, cityCategoryMap, taxonomyTagMap],
  );

  const deferredPlaces = useDeferredValue(filteredPlaces);

  const clustered = useMemo(
    () => clusterPlacesForRegion(deferredPlaces, deferredRegion),
    [deferredPlaces, deferredRegion],
  );

  const activePlace = useMemo(
    () => filteredPlaces.find((place) => place.id === activePlaceId) ?? null,
    [filteredPlaces, activePlaceId],
  );

  const activeVenueId = useMemo(() => resolveVenueIdForSaving(activePlace), [activePlace]);

  useEffect(() => {
    if (!activePlaceId) return;
    if (!filteredPlaces.some((place) => place.id === activePlaceId)) {
      setActivePlaceId(null);
    }
  }, [filteredPlaces, activePlaceId]);

  const activeAppearance = useMemo(
    () => (activePlace ? resolveCategoryAppearance(activePlace, selectedCategoryTags) : DEFAULT_CATEGORY_APPEARANCE),
    [activePlace, selectedCategoryTags],
  );

  const activePlaceName = useMemo(() => (activePlace ? resolvePlaceName(activePlace) : null), [activePlace]);

  const activeCategoryLabel = useMemo(() => {
    if (!activePlace) return null;
    const primary = resolvePrimaryCategoryKey(activePlace, selectedCategoryTags);
    if (primary) {
      return formatCategoryName(primary, categoryLabelByKey);
    }
    const fallback = activePlace.categories?.[0];
    return fallback ? formatCategoryName(fallback, categoryLabelByKey) : null;
  }, [activePlace, selectedCategoryTags, categoryLabelByKey]);

  const activeOpenNow = useMemo(() => (activePlace ? isPlaceOpenNow(activePlace, now) : null), [activePlace, now]);
  const activePriceLevel = useMemo(() => (activePlace ? resolvePriceLevel(activePlace) : null), [activePlace]);
  const activeAddress = useMemo(() => (activePlace ? formatPlaceAddress(activePlace) : null), [activePlace]);
  const activeDescription = useMemo(() => {
    if (!activePlace?.description) return null;
    const trimmed = activePlace.description.trim();
    return trimmed.length ? trimmed : null;
  }, [activePlace]);
  const activeWebsite = activePlace?.website ?? null;
  const activeWebsiteHost = useMemo(() => formatWebsiteHost(activeWebsite), [activeWebsite]);
  const activePlaceIsSaved = activePlace ? isSaved(activePlace.id) : false;
  const activePlaceSaving = activePlace?.id ? savingIds.has(activePlace.id) : false;

  const handleToggleSave = useCallback(async () => {
    if (!activePlace || activePlaceSaving) return;
    const payload = buildPlaceSavePayload(activePlace, city.slug ?? null);
    if (activePlaceName) {
      payload.name = activePlaceName;
    }
    if (activeAddress) {
      payload.address = activeAddress;
    }
    if (activeVenueId) {
      payload.venueId = activeVenueId;
    }
    try {
      await toggle(payload);
    } catch (actionError) {
      Alert.alert('Save place', describeActionError(actionError));
    }
  }, [activePlace, activePlaceSaving, toggle, city.slug, activeVenueId, activeAddress]);

  useEffect(() => {
    const broadcast = filteredPlaces.slice(0, 80).map((place) => ({
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      categories: place.tags?.length ? place.tags : place.categories ?? [],
      address: place.address ?? null,
      locality: place.locality ?? null,
      highlightedCategory: resolvePrimaryCategoryKey(place, selectedCategoryTags),
    }));
    emitMapPlacesUpdated(broadcast);
  }, [filteredPlaces, selectedCategoryTags]);

  useEffect(() => {
    let cancelled = false;
    if (!activeVenueId) {
      setActiveVenueSessions(null);
      setActiveVenueSessionsLoading(false);
      return;
    }
    setActiveVenueSessions(null);
    setActiveVenueSessionsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('v_venue_attendance_summary')
          .select('upcoming_sessions,total_sessions')
          .eq('venue_id', activeVenueId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          setActiveVenueSessions({
            upcoming: typeof data?.upcoming_sessions === 'number' ? data.upcoming_sessions : 0,
            total: typeof data?.total_sessions === 'number' ? data.total_sessions : 0,
          });
        }
      } catch (sessionError) {
        if (!cancelled) {
          console.info('[Map] Failed to load session counts', sessionError);
          setActiveVenueSessions(null);
        }
      } finally {
        if (!cancelled) {
          setActiveVenueSessionsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVenueId]);

  const placesCountLabel = useMemo(() => {
    if (loading && !filteredPlaces.length) return null;
    if (!filteredPlaces.length) return 'No places in view';
    return `${filteredPlaces.length} place${filteredPlaces.length === 1 ? '' : 's'} in view`;
  }, [filteredPlaces.length, loading]);

  const hasActiveFilters = activeFilterCount > 0;

  const noResultsMessage = useMemo(() => {
    if (loading || filteredPlaces.length || !hasActiveFilters) return null;
    if (filters.categories.length) {
      const labelText = joinWithLimit(selectedCategoryLabels, 2);
      return `No ${labelText} places match these filters here yet. Try adjusting the filters or moving the map.`;
    }
    return 'No places match the selected filters here yet. Try adjusting the filters or moving the map.';
  }, [loading, filteredPlaces.length, hasActiveFilters, filters.categories.length, selectedCategoryLabels]);

  const providerHint = useMemo(() => {
    if (!filteredPlaces.length) return null;
    return 'Venues synced from Supabase (fallback: OpenStreetMap).';
  }, [filteredPlaces.length]);

  const shouldShowEventsRail = eventsQuery.isFetching || eventHighlights.length > 0 || eventsQuery.isError;
  const eventsErrorMessage = eventsQuery.error?.message ?? 'Unable to load nearby events.';

  const dismissActivePlace = useCallback(() => setActivePlaceId(null), []);

  const removeCategory = (categoryId: string) => {
    setFilters((prev) => {
      if (!prev.categories.includes(categoryId)) return prev;
      return { ...prev, categories: prev.categories.filter((value) => value !== categoryId) };
    });
  };

  const openFilterModal = () => {
    setDraftFilters(cloneFilters(filters));
    setFilterModalVisible(true);
  };

  const closeFilterModal = () => {
    setFilterModalVisible(false);
  };

  const applyDraftFilters = () => {
    const nextFilters = cloneFilters(draftFilters);
    nextFilters.categories = filterValidCategories(nextFilters.categories);
    setFilters(nextFilters);
    setFilterModalVisible(false);
    trackTaxonomyFiltersApplied({
      tier3Ids: nextFilters.categories,
      platform: 'mobile',
      surface: 'map_filters',
      city: city.slug,
    });
  };

  const resetDraftFilters = () => {
    setDraftFilters(cloneFilters(DEFAULT_FILTERS));
  };

  const toggleDraftCategory = (categoryId: string) => {
    if (!taxonomyIdSet.has(categoryId)) return;
    setDraftFilters((prev) => {
      const exists = prev.categories.includes(categoryId);
      const nextCategories = exists
        ? prev.categories.filter((value) => value !== categoryId)
        : filterValidCategories([...prev.categories, categoryId]);
      trackTaxonomyToggle({
        tier3Id: categoryId,
        active: !exists,
        selectionCount: nextCategories.length,
        platform: 'mobile',
        surface: 'map_filters',
        city: city.slug,
      });
      return { ...prev, categories: nextCategories };
    });
  };

  const toggleDraftPriceLevel = (level: number) => {
    setDraftFilters((prev) => {
      const exists = prev.priceLevels.includes(level);
      const nextPriceLevels = exists
        ? prev.priceLevels.filter((value) => value !== level)
        : [...prev.priceLevels, level];
      return { ...prev, priceLevels: nextPriceLevels };
    });
  };

  const selectDraftDistance = (value: number | null) => {
    setDraftFilters((prev) => {
      if (prev.maxDistanceKm === value) return prev;
      return { ...prev, maxDistanceKm: value };
    });
  };

  const selectDraftCapacity = (key: string) => {
    setDraftFilters((prev) => {
      if (prev.capacityKey === key) return prev;
      return { ...prev, capacityKey: key };
    });
  };

  const selectDraftTimeWindow = (key: TimeWindowKey) => {
    setDraftFilters((prev) => {
      if (prev.timeWindow === key) return prev;
      return { ...prev, timeWindow: key };
    });
  };

  const adjustZoom = useCallback(
    (factor: number) => {
      const nextLatitudeDelta = Math.min(
        Math.max(region.latitudeDelta * factor, MIN_MAP_DELTA),
        MAX_MAP_DELTA,
      );
      const nextLongitudeDelta = Math.min(
        Math.max(region.longitudeDelta * factor, MIN_MAP_DELTA),
        MAX_MAP_DELTA,
      );
      mapRef.current?.animateToRegion?.(
        {
          latitude: region.latitude,
          longitude: region.longitude,
          latitudeDelta: nextLatitudeDelta,
          longitudeDelta: nextLongitudeDelta,
        },
        200,
      );
    },
    [region],
  );

  const handleZoomIn = useCallback(() => {
    adjustZoom(0.65);
  }, [adjustZoom]);

  const handleZoomOut = useCallback(() => {
    adjustZoom(1 / 0.65);
  }, [adjustZoom]);

  const handleMarkerPress = useCallback(
    (place: PlaceSummary, coordinateOverride?: { latitude: number; longitude: number }) => {
      const targetLatitude = coordinateOverride?.latitude ?? place.lat;
      const targetLongitude = coordinateOverride?.longitude ?? place.lng;
      mapRef.current?.animateToRegion?.(
        {
          latitude: targetLatitude,
          longitude: targetLongitude,
          latitudeDelta: Math.max(region.latitudeDelta * 0.6, MIN_MAP_DELTA),
          longitudeDelta: Math.max(region.longitudeDelta * 0.6, MIN_MAP_DELTA),
        },
        220,
      );
      setActivePlaceId(place.id);
    },
    [region],
  );

  const handlePlanEvent = useCallback(
    (place: PlaceSummary, activityLabel?: string | null) => {
      const params: Record<string, string> = {
        lat: String(place.lat),
        lng: String(place.lng),
        placeName: place.name,
      };
      const address = formatPlaceAddress(place);
      if (address) params.placeAddress = address;
      if (activityLabel && activityLabel.trim() && activityLabel !== 'Activity') {
        params.activityName = activityLabel.trim();
      }
      router.push({ pathname: '/add-event', params });
    },
    [router],
  );

  const handleOpenWebsite = useCallback((url?: string | null) => {
    const target = normaliseWebsiteUrl(url ?? null);
    if (!target) return;
    Linking.openURL(target).catch((error) => {
      console.warn('[Map] Failed to open venue website', error);
    });
  }, []);

  const handleClusterPress = useCallback(
    (cluster: PlaceCluster) => {
      if (!mapRef.current || !cluster.places.length) return;
      if (cluster.places.length === 1) {
        handleMarkerPress(cluster.places[0], cluster.coordinate);
        return;
      }

      const latitudeDelta = Math.max(region.latitudeDelta * 0.45, MIN_MAP_DELTA);
      const longitudeDelta = Math.max(region.longitudeDelta * 0.45, MIN_MAP_DELTA);

      mapRef.current.animateToRegion?.(
        {
          latitude: cluster.coordinate.latitude,
          longitude: cluster.coordinate.longitude,
          latitudeDelta,
          longitudeDelta,
        },
        240,
      );
    },
    [handleMarkerPress, region.latitudeDelta, region.longitudeDelta],
  );

  const emptyState = !loading && filteredPlaces.length === 0;

  const emptyStateTitle = hasActiveFilters && emptyState ? 'No places match your filters here.' : 'No places in view yet.';

  const emptyStateSubtitle = friendlyError
    ?? (hasActiveFilters && emptyState
      ? 'Try widening the map area or tweaking your filters to discover more activities.'
      : 'Move the map or adjust filters to discover activities nearby.');

  const citySwitcherEnabled = CITY_SWITCHER_ENABLED;
  const canCycleCities = citySwitcherEnabled && availableCities.length > 1;

  const cycleCity = useCallback(() => {
    if (!canCycleCities) return;
    const currentIndex = availableCities.findIndex((candidate) => candidate.slug === citySlug);
    const next = availableCities[(currentIndex + 1) % availableCities.length];
    setCitySlug(next.slug);
  }, [availableCities, canCycleCities, citySlug]);

  return (
    <SafeAreaView style={styles.screen}>
      <Modal transparent visible={filterModalVisible} animationType="slide" onRequestClose={closeFilterModal}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalScrim} onPress={closeFilterModal} accessibilityRole="button" accessibilityLabel="Close filters" />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Refine search</Text>
              <TouchableOpacity accessibilityRole="button" onPress={closeFilterModal}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Categories</Text>
                <Text style={styles.modalSectionSubtitle}>
                  {draftFilters.categories.length
                    ? draftCategoryLabels.join(', ')
                    : 'No categories selected'}
                </Text>
                <TaxonomyCategoryPicker selectedIds={draftFilters.categories} onToggle={toggleDraftCategory} />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Price</Text>
                <View style={styles.modalChipGroup}>
                  {PRICE_LEVEL_OPTIONS.map((option) => {
                    const active = draftFilters.priceLevels.includes(option.level);
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => toggleDraftPriceLevel(option.level)}
                        style={[styles.modalChip, active ? styles.modalChipActive : styles.modalChipInactive]}
                      >
                        <Text style={active ? styles.modalChipTextActive : styles.modalChipText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Distance</Text>
                <View style={styles.modalChipGroup}>
                  {DISTANCE_OPTIONS.map((option) => {
                    const active = draftFilters.maxDistanceKm === option.value;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => selectDraftDistance(option.value)}
                        style={[styles.modalChip, active ? styles.modalChipActive : styles.modalChipInactive]}
                      >
                        <Text style={active ? styles.modalChipTextActive : styles.modalChipText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Group size</Text>
                <View style={styles.modalChipGroup}>
                  {CAPACITY_OPTIONS.map((option) => {
                    const active = draftFilters.capacityKey === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => selectDraftCapacity(option.key)}
                        style={[styles.modalChip, active ? styles.modalChipActive : styles.modalChipInactive]}
                      >
                        <Text style={active ? styles.modalChipTextActive : styles.modalChipText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Working hours</Text>
                <View style={styles.modalChipGroup}>
                  {TIME_WINDOW_OPTIONS.map((option) => {
                    const active = draftFilters.timeWindow === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => selectDraftTimeWindow(option.key)}
                        style={[styles.modalChip, active ? styles.modalChipActive : styles.modalChipInactive]}
                      >
                        <Text style={active ? styles.modalChipTextActive : styles.modalChipText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity accessibilityRole="button" style={styles.modalReset} onPress={resetDraftFilters}>
                <Text style={styles.modalResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.modalApply} onPress={applyDraftFilters}>
                <Text style={styles.modalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{headerTitle}</Text>
            <Text style={styles.subtitle}>{filterSubtitle ?? defaultSubtitle}</Text>
            {hasLocationPermission ? null : <Text style={styles.cityLabel}>{city.label}</Text>}
            {filterSubtitle ? <Text style={styles.filterSummary}>{filterSubtitle}</Text> : null}
            {placesCountLabel ? <Text style={styles.resultCount}>{placesCountLabel}</Text> : null}
            {providerHint ? <Text style={styles.providerHint}>{providerHint}</Text> : null}
            {noResultsMessage ? <Text style={styles.noResultsMessage}>{noResultsMessage}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            {citySwitcherEnabled ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Switch city"
                disabled={!canCycleCities}
                onPress={cycleCity}
                style={[styles.citySwitcher, !canCycleCities && styles.citySwitcherDisabled]}
              >
                <Text style={styles.citySwitcherText}>
                  {canCycleCities ? 'Switch city' : city.name}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open filters"
              onPress={openFilterModal}
              style={[styles.filterButton, activeFilterCount ? styles.filterButtonActive : null]}
            >
              <Text style={styles.filterButtonText}>
                {activeFilterCount ? `${activeFilterCount} Filters` : 'Filters'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {filters.categories.length ? (
            filters.categories.map((categoryId) => {
              const label =
                taxonomyIndex.get(categoryId)?.label ?? formatCategoryName(categoryId, categoryLabelByKey);
              return (
                <View key={categoryId} style={styles.selectedCategoryChip}>
                  <Text style={styles.selectedCategoryChipText}>{label}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.selectedCategoryChipRemove}
                    onPress={() => removeCategory(categoryId)}
                  >
                    <Text style={styles.selectedCategoryChipRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <View style={styles.selectedCategoryChipMuted}>
              <Text style={styles.selectedCategoryChipMutedText}>All activity types</Text>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={openFilterModal}
            style={styles.addCategoryChip}
          >
            <Text style={styles.addCategoryChipText}>Browse categories</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      {shouldShowEventsRail ? (
        <View style={styles.eventsSection}>
          <View style={styles.eventsSectionHeader}>
            <View>
              <Text style={styles.eventsSectionTitle}>Community confirmations nearby</Text>
              <Text style={styles.eventsSectionSubtitle}>Upcoming events validating places in this view.</Text>
            </View>
            {eventsQuery.isFetching ? <ActivityIndicator color="#0F172A" size="small" /> : null}
          </View>
          {eventsQuery.isError ? <Text style={styles.eventsSectionError}>{eventsErrorMessage}</Text> : null}
          {!eventsQuery.isFetching && !eventsQuery.isError && !eventHighlights.length ? (
            <Text style={styles.eventsEmptyCopy}>No upcoming events here yet. Move the map or zoom out.</Text>
          ) : null}
          {eventHighlights.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventsCarousel}
            >
              {eventHighlights.map((eventSummary) => {
                const timeLabel = describeEventTime(eventSummary);
                const placeLabel = describeEventPlaceLabel(eventSummary) ?? 'Location to be confirmed';
                const verificationProgress = buildEventVerificationProgress(eventSummary);
                const verificationColor = verificationProgress?.complete ? '#059669' : '#F59E0B';
                const reliabilityScore = clampEventReliability(eventSummary.reliability_score);
                const reliabilityMeta = describeEventReliability(reliabilityScore);
                const reliabilityWidth = reliabilityScore == null ? 12 : reliabilityScore;
                return (
                  <TouchableOpacity
                    key={eventSummary.id}
                    accessibilityRole="button"
                    onPress={() => handleOpenEvent(eventSummary)}
                    style={styles.eventCard}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.eventCardTitle} numberOfLines={2}>
                      {eventSummary.title}
                    </Text>
                    <Text style={styles.eventCardTime}>{timeLabel}</Text>
                    <Text style={styles.eventCardPlace} numberOfLines={1}>
                      {placeLabel}
                    </Text>
                    {verificationProgress ? (
                      <View style={styles.eventProgressBlock}>
                        <View style={styles.eventProgressHeader}>
                          <Text style={styles.eventProgressLabel}>Community confirmations</Text>
                          <Text style={styles.eventProgressValue}>
                            {verificationProgress.confirmations}/{verificationProgress.required}
                          </Text>
                        </View>
                        <View style={styles.eventProgressBarBackground}>
                          <View
                            style={[
                              styles.eventProgressBarFill,
                              { width: `${verificationProgress.percent}%`, backgroundColor: verificationColor },
                            ]}
                          />
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.eventProgressPending}>Awaiting confirmations</Text>
                    )}
                    <View style={styles.eventProgressBlock}>
                      <View style={styles.eventProgressHeader}>
                        <Text style={styles.eventProgressLabel}>Reliability</Text>
                        <Text style={styles.eventProgressValue}>{reliabilityMeta.label}</Text>
                      </View>
                      <Text style={styles.eventReliabilityHelper}>{reliabilityMeta.helper}</Text>
                      <View style={styles.eventProgressBarBackground}>
                        <View
                          style={[
                            styles.eventProgressBarFill,
                            { width: `${reliabilityWidth}%`, backgroundColor: reliabilityMeta.color },
                          ]}
                        />
                      </View>
                    </View>
                    {eventSummary.tags?.length ? (
                      <View style={styles.eventTagRow}>
                        {eventSummary.tags.slice(0, 2).map((tag) => (
                          <Text key={tag} style={styles.eventTag}>
                            #{tag}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFillObject}
          region={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          showsUserLocation
          loadingEnabled
        >
          {clustered.clusters.map((cluster) => (
            <Marker
              key={`cluster-${cluster.id}`}
              coordinate={cluster.coordinate}
              onPress={() => handleClusterPress(cluster)}
            >
              <View style={styles.clusterMarker}>
                <Text style={styles.clusterMarkerText}>{cluster.count}</Text>
              </View>
            </Marker>
          ))}
          {clustered.singles.map(({ place, coordinate }) => {
            const appearance = resolveCategoryAppearance(place, selectedCategoryTags);
            const primaryCategoryKey = resolvePrimaryCategoryKey(place, selectedCategoryTags);
            const descriptionLabel = primaryCategoryKey
              ? formatCategoryName(primaryCategoryKey, categoryLabelByKey)
              : place.categories[0]
                ? formatCategoryName(place.categories[0], categoryLabelByKey)
                : 'Activity';
            const shortAddressLabel = formatShortAddress(place);
            const markerLabel = resolvePlaceName(place) ?? place.name;
            const isActive = activePlaceId === place.id;
            return (
              <Marker
                key={place.id}
                coordinate={coordinate}
                onPress={() => handleMarkerPress(place, coordinate)}
                onCalloutPress={() => handlePlanEvent(place, descriptionLabel)}
              >
                <View style={styles.markerWrapper}>
                  <View
                    style={[
                      styles.marker,
                      { backgroundColor: appearance.color },
                      isActive && styles.markerActive,
                    ]}
                  >
                    <Text style={styles.markerEmoji}>{appearance.emoji}</Text>
                  </View>
                  {markerLabel ? (
                    <View style={[styles.markerLabel, isActive && styles.markerLabelActive]}>
                      <Text numberOfLines={1} style={styles.markerLabelText}>
                        {markerLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Callout tooltip>
                  <View style={styles.markerCallout}>
                    <Text style={styles.markerCalloutTitle}>{markerLabel}</Text>
                    {shortAddressLabel ? (
                      <Text style={styles.markerCalloutSubtitle}>{shortAddressLabel}</Text>
                    ) : null}
                    <Text style={styles.markerCalloutCta}>Plan an event ↗</Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>
        {loading ? (
          <View style={styles.loadingBadge}>
            <ActivityIndicator color="#10B981" size="small" />
            <Text style={styles.loadingBadgeText}>Loading places…</Text>
          </View>
        ) : null}
        {friendlyError && !emptyState ? (
          <View style={styles.errorBadge}>
            <Text style={styles.errorBadgeText}>{friendlyError}</Text>
          </View>
        ) : null}
        {emptyState ? (
          <View style={styles.emptyOverlay}>
            <Text style={styles.emptyTitle}>{emptyStateTitle}</Text>
            <Text style={styles.emptySubtitle}>
              {emptyStateSubtitle}
            </Text>
          </View>
        ) : null}
        <View style={styles.zoomControls}>
          <TouchableOpacity accessibilityRole="button" onPress={handleZoomIn} style={styles.zoomButton}>
            <Text style={styles.zoomButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={handleZoomOut} style={styles.zoomButton}>
            <Text style={styles.zoomButtonText}>-</Text>
          </TouchableOpacity>
        </View>
        {activePlace ? (
          <View style={styles.placeDetailWrapper}>
            <View style={styles.placeDetailCard}>
              <View style={styles.placeDetailHeader}>
                <View
                  style={[
                    styles.placeDetailEmoji,
                    { backgroundColor: activeAppearance ? `${activeAppearance.color}22` : '#E2E8F0' },
                  ]}
                >
                  <Text style={styles.markerEmoji}>{activeAppearance?.emoji ?? '📍'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeDetailTitle}>{activePlaceName ?? activePlace.name}</Text>
                  {activeCategoryLabel ? (
                    <Text style={styles.placeDetailSubtitle}>{activeCategoryLabel}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={handleToggleSave}
                  disabled={activePlaceSaving}
                  style={[
                    styles.placeDetailSaveButton,
                    activePlaceIsSaved && styles.placeDetailSaveButtonActive,
                    activePlaceSaving && styles.placeDetailSaveButtonDisabled,
                  ]}
                >
                  {activePlaceSaving ? (
                    <ActivityIndicator size="small" color={activePlaceIsSaved ? '#047857' : '#0F172A'} />
                  ) : (
                    <Text
                      style={[
                        styles.placeDetailSaveButtonText,
                        activePlaceIsSaved && styles.placeDetailSaveButtonTextActive,
                      ]}
                    >
                      {activePlaceIsSaved ? 'Saved' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" onPress={dismissActivePlace}>
                  <Text style={styles.placeDetailClose}>×</Text>
                </TouchableOpacity>
              </View>
              {activeAddress ? <Text style={styles.placeDetailAddress}>{activeAddress}</Text> : null}
              <View style={styles.placeDetailMetaRow}>
                {typeof activeOpenNow === 'boolean' ? (
                  <Text
                    style={[
                      styles.placeDetailBadge,
                      activeOpenNow ? styles.placeDetailBadgeOpen : styles.placeDetailBadgeClosed,
                    ]}
                  >
                    {activeOpenNow ? 'Open now' : 'Closed'}
                  </Text>
                ) : null}
                {activePriceLevel != null ? (
                  <Text style={styles.placeDetailMetaText}>Price {priceLevelLabel(activePriceLevel)}</Text>
                ) : null}
              </View>
              {activeVenueId ? (
                <View style={styles.placeDetailSessionsRow}>
                  {activeVenueSessionsLoading ? (
                    <Text style={styles.placeDetailMetaText}>Checking upcoming sessions…</Text>
                  ) : activeVenueSessions ? (
                    <>
                      <Text style={styles.placeDetailMetaText}>
                        {activeVenueSessions.upcoming
                          ? `${activeVenueSessions.upcoming} upcoming session${activeVenueSessions.upcoming === 1 ? '' : 's'}`
                          : 'No upcoming sessions yet'}
                      </Text>
                      {activeVenueSessions.total > activeVenueSessions.upcoming ? (
                        <Text style={styles.placeDetailMetaSubtle}>
                          {activeVenueSessions.total} total session{activeVenueSessions.total === 1 ? '' : 's'} hosted here
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.placeDetailMetaSubtle}>Session info unavailable</Text>
                  )}
                </View>
              ) : null}
              {activeDescription ? (
                <Text style={styles.placeDetailDescription} numberOfLines={4}>
                  {activeDescription}
                </Text>
              ) : null}
              {activeWebsite && activeWebsiteHost ? (
                <TouchableOpacity
                  accessibilityRole="link"
                  style={styles.placeDetailWebsiteButton}
                  onPress={() => handleOpenWebsite(activeWebsite)}
                >
                  <Text style={styles.placeDetailWebsiteText}>{activeWebsiteHost}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.placeDetailActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.placeDetailPrimaryAction}
                  onPress={() => handlePlanEvent(activePlace, activeCategoryLabel)}
                >
                  <Text style={styles.placeDetailPrimaryActionText}>Create event here</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.placeDetailSecondaryAction}
                  onPress={dismissActivePlace}
                >
                  <Text style={styles.placeDetailSecondaryActionText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {attributions.length
            ? `Data from ${attributions.map((attr) => attr.text).join(', ')}`
            : 'Data from Foursquare Places.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  eventsSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingBottom: 4,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  eventsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  eventsSectionSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#475569',
  },
  eventsSectionError: {
    marginTop: 4,
    paddingHorizontal: 4,
    fontSize: 12,
    color: '#DC2626',
  },
  eventsEmptyCopy: {
    marginTop: 2,
    paddingHorizontal: 4,
    fontSize: 12,
    color: '#475569',
  },
  eventsCarousel: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  eventCard: {
    width: 240,
    padding: 16,
    borderRadius: 18,
    marginRight: 12,
    backgroundColor: '#0F172A',
  },
  eventCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  eventCardTime: {
    marginTop: 4,
    fontSize: 12,
    color: '#E2E8F0',
  },
  eventCardPlace: {
    marginTop: 2,
    fontSize: 12,
    color: '#93C5FD',
  },
  eventProgressBlock: {
    marginTop: 12,
  },
  eventProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventProgressLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: 'rgba(226,232,240,0.8)',
  },
  eventProgressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  eventReliabilityHelper: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(226,232,240,0.75)',
  },
  eventProgressBarBackground: {
    marginTop: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.35)',
  },
  eventProgressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#F59E0B',
  },
  eventProgressPending: {
    marginTop: 12,
    fontSize: 12,
    color: '#FDE68A',
  },
  eventTagRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  eventTag: {
    marginRight: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.08)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#FCD34D',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  cityLabel: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
  filterSummary: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  resultCount: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#0EA5E9',
  },
  providerHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
  },
  noResultsMessage: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#F97316',
  },
  headerActions: {
    alignItems: 'flex-end',
  },
  citySwitcher: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  citySwitcherDisabled: {
    opacity: 0.6,
  },
  citySwitcherText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  filterButtonActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#E0F2FE',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  selectedCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    gap: 6,
  },
  selectedCategoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  selectedCategoryChipRemove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  selectedCategoryChipRemoveText: {
    fontSize: 14,
    color: '#1E3A8A',
    fontWeight: '700',
  },
  selectedCategoryChipMuted: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  selectedCategoryChipMutedText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  addCategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
  },
  addCategoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalClose: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  modalScroll: {
    marginBottom: 16,
  },
  modalContent: {
    paddingBottom: 4,
  },
  modalSection: {
    marginBottom: 18,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  modalSectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  modalChipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  modalChipInactive: {
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  modalChipActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#E0F2FE',
  },
  modalChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  modalChipTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 4,
  },
  modalReset: {
    flex: 1,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalResetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalApply: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  markerWrapper: {
    alignItems: 'center',
  },
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DEFAULT_CATEGORY_APPEARANCE.color,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  markerActive: {
    borderColor: '#0EA5E9',
    transform: [{ scale: 1.05 }],
  },
  markerEmoji: {
    fontSize: 18,
  },
  markerLabel: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.88)',
    maxWidth: 140,
  },
  markerLabelActive: {
    backgroundColor: '#0F172A',
  },
  markerLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  markerCallout: {
    minWidth: 160,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  markerCalloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  markerCalloutSubtitle: {
    fontSize: 12,
    color: '#CBD5F5',
    marginBottom: 6,
  },
  markerCalloutCta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
  },
  clusterMarker: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(16,185,129,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ECFDF5',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  clusterMarkerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingBadgeText: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 136,
    gap: 12,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  zoomButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 28,
  },
  placeDetailWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  placeDetailCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  placeDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  placeDetailEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeDetailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  placeDetailSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#475569',
  },
  placeDetailClose: {
    fontSize: 24,
    color: '#94A3B8',
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  placeDetailSaveButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    marginRight: 4,
  },
  placeDetailSaveButtonActive: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  placeDetailSaveButtonDisabled: {
    opacity: 0.7,
  },
  placeDetailSaveButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  placeDetailSaveButtonTextActive: {
    color: '#047857',
  },
  placeDetailAddress: {
    marginTop: 14,
    fontSize: 13,
    color: '#475569',
  },
  placeDetailMetaRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  placeDetailBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '700',
  },
  placeDetailBadgeOpen: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  placeDetailBadgeClosed: {
    backgroundColor: '#FFE4E6',
    color: '#BE123C',
  },
  placeDetailMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  placeDetailMetaSubtle: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  placeDetailSessionsRow: {
    marginTop: 8,
  },
  placeDetailDescription: {
    marginTop: 12,
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  placeDetailWebsiteButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E0F2FE',
  },
  placeDetailWebsiteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  placeDetailActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  placeDetailPrimaryAction: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#0EA5E9',
    paddingVertical: 12,
    alignItems: 'center',
  },
  placeDetailPrimaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  placeDetailSecondaryAction: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeDetailSecondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  errorBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(239,68,68,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  errorBadgeText: {
    color: '#FEF2F2',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '40%',
    marginTop: -40,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#CBD5F5',
    textAlign: 'center',
  },
  attribution: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  attributionText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
});
