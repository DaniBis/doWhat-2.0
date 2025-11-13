import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
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
import MapView, { Marker, PROVIDER_GOOGLE, type MapViewProps } from 'react-native-maps';
import ngeohash from 'ngeohash';
import { useRouter } from 'expo-router';

import {
  CITY_SWITCHER_ENABLED,
  DEFAULT_CITY_SLUG,
  createPlacesFetcher,
  getCityCategoryConfigMap,
  getCityConfig,
  listCities,
  type CityCategoryConfig,
  type CityConfig,
  type PlaceSummary,
  type PlacesViewportQuery,
  usePlaces,
} from '@dowhat/shared';

import { createWebUrl } from '../../../lib/web';
import { emitMapPlacesUpdated } from '../../../lib/events';
import {
  DEFAULT_CATEGORY_APPEARANCE,
  formatCategoryLabel,
  normaliseCategoryKey,
  resolveCategoryAppearance,
  resolvePrimaryCategoryKey,
} from '../../../lib/placeCategories';

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
    venue?: { attributes?: { capacity?: number | string | null } | null } | null;
  } | null;
  google_places?: {
    priceLevel?: number | string | null;
    openingHours?: { openNow?: boolean | null } | null;
  } | null;
  openstreetmap?: {
    capacity?: number | string | null;
    opening_hours?: string | null;
    tags?: {
      capacity?: number | string | null;
      opening_hours?: string | null;
    } | null;
  } | null;
};

const toPlaceMetadata = (metadata: PlaceSummary['metadata']): PlaceMetadata | undefined => {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata as PlaceMetadata;
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
      const targetCategories = config?.queryCategories?.length
        ? config.queryCategories.map((value) => normaliseCategoryKey(value) ?? value.toLowerCase())
        : [categoryKey];
      const hasCategory = targetCategories.some((target) => normalizedCategories.has(target));
      if (!hasCategory) return false;
      if (config?.tagFilters?.length) {
        const normalizedFilters = config.tagFilters
          .map((value) => normaliseCategoryKey(value) ?? value.toLowerCase())
          .filter(Boolean);
        if (!normalizedFilters.some((tag) => placeTags.has(tag))) {
          return false;
        }
      }
      return true;
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
type ProviderCounts = {
  openstreetmap: number;
  foursquare: number;
  google_places: number;
};

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

const formatPlaceAddress = (place: PlaceSummary) => {
  const rawParts = [place.address, place.locality, place.region, place.country];
  const parts = rawParts
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
  return parts.length ? parts.join(', ') : null;
};

export default function MapScreen() {

  const router = useRouter();
  const availableCities = useMemo(() => listCities(), []);
  const [citySlug, setCitySlug] = useState<string>(DEFAULT_CITY_SLUG);
  const city = useMemo(() => getCityConfig(citySlug), [citySlug]);
  const cityCategoryMap = useMemo(() => getCityCategoryConfigMap(city), [city]);
  const cityRegion = useMemo(() => normaliseRegion(cityToRegion(city)), [city]);

  const [region, setRegion] = useState<MapRegion>(() => cityRegion);
  const [filters, setFilters] = useState<Filters>(() => cloneFilters(DEFAULT_FILTERS));
  const [draftFilters, setDraftFilters] = useState<Filters>(() => cloneFilters(DEFAULT_FILTERS));
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [attributions, setAttributions] = useState<Array<{ text: string; url?: string; license?: string }>>([]);
  const [providerCounts, setProviderCounts] = useState<ProviderCounts>({
    openstreetmap: 0,
    foursquare: 0,
    google_places: 0,
  });
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  const mapRef = useRef<ComponentRef<typeof MapView> | null>(null);
  const lastRegionRef = useRef<MapRegion>(cityRegion);

  const categoryOptions = useMemo(
    () => city.enabledCategories.map(({ key, label }) => ({ key, label })),
    [city],
  );
  const categoryLabelByKey = useMemo(() => buildCategoryLabelMap(city), [city]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filterSummary = useMemo(() => getFilterSummary(filters, categoryLabelByKey), [filters, categoryLabelByKey]);
  const headerTitle = useMemo(() => {
    if (filters.categories.length === 1) {
      return `Discover ${formatCategoryName(filters.categories[0], categoryLabelByKey)} Places`;
    }
    return 'Discover Places';
  }, [filters.categories, categoryLabelByKey]);
  const defaultSubtitle =
    'Move the map to discover venues powered by OpenStreetMap and Foursquare, then plan an activity there.';
  const filterSubtitle = filterSummary ? `Filters: ${filterSummary}` : null;

  const now = useMemo(() => new Date(), [filters.timeWindow]);

  const categoriesForQuery = useMemo(() => {
    if (!filters.categories.length) return undefined;
    const expanded = new Set<string>();
    filters.categories.forEach((key) => {
      const config = cityCategoryMap.get(key);
      if (config) {
        config.queryCategories.forEach((value) => expanded.add(value));
      } else {
        expanded.add(key);
      }
    });
    return Array.from(expanded);
  }, [filters.categories, cityCategoryMap]);

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
      const allowed = prev.categories.filter((key) => cityCategoryMap.has(key));
      if (allowed.length === prev.categories.length) return prev;
      return { ...prev, categories: allowed };
    });
    setDraftFilters((prev) => {
      const allowed = prev.categories.filter((key) => cityCategoryMap.has(key));
      if (allowed.length === prev.categories.length) return prev;
      return { ...prev, categories: allowed };
    });
  }, [cityCategoryMap]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (!isMounted) return;
        if (existing.status === 'granted') {
          setHasLocationPermission(true);
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (isMounted && position) {
            const nextRegion: MapRegion = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              latitudeDelta: Math.max(cityRegion.latitudeDelta * 0.4, MIN_MAP_DELTA),
              longitudeDelta: Math.max(cityRegion.longitudeDelta * 0.4, MIN_MAP_DELTA),
            };
            setRegion(nextRegion);
            lastRegionRef.current = nextRegion;
            setTargetQuery(buildViewportQuery(nextRegion));
          }
        } else {
          const requested = await Location.requestForegroundPermissionsAsync();
          if (!isMounted) return;
          if (requested.status === 'granted') {
            setHasLocationPermission(true);
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (isMounted && position) {
              const nextRegion: MapRegion = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                latitudeDelta: Math.max(cityRegion.latitudeDelta * 0.4, MIN_MAP_DELTA),
                longitudeDelta: Math.max(cityRegion.longitudeDelta * 0.4, MIN_MAP_DELTA),
              };
              setRegion(nextRegion);
              lastRegionRef.current = nextRegion;
              setTargetQuery(buildViewportQuery(nextRegion));
            }
          } else {
            setHasLocationPermission(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.warn('Location permission error', err);
          setHasLocationPermission(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [buildViewportQuery, cityRegion]);

  const placesFetcher = useMemo(
    () =>
      createPlacesFetcher({
        buildUrl: () => createWebUrl('/api/places').toString(),
        includeCredentials: true,
      }),
    [],
  );

  const placesQuery = usePlaces(query, {
    fetcher: placesFetcher,
    enabled: Boolean(query),
    staleTime: 2 * 60_000,
  });

  const loading = placesQuery.isFetching;
  const error = placesQuery.error?.message ?? null;
  const friendlyError = error ? error.replace(/^TypeError:\s*/i, '').trim() || null : null;
  const places = placesQuery.data?.places ?? [];

  useEffect(() => {
    if (placesQuery.data?.attribution) {
      setAttributions(placesQuery.data.attribution);
    }
  }, [placesQuery.data?.attribution]);

  useEffect(() => {
    if (placesQuery.data?.providerCounts) {
      setProviderCounts({
        openstreetmap: placesQuery.data.providerCounts.openstreetmap ?? 0,
        foursquare: placesQuery.data.providerCounts.foursquare ?? 0,
        google_places: placesQuery.data.providerCounts.google_places ?? 0,
      });
    }
  }, [placesQuery.data?.providerCounts]);

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
    () => places.filter((place) => placeMatchesFilters(place, filters, deferredRegion, now, cityCategoryMap)),
    [places, filters, deferredRegion, now, cityCategoryMap],
  );

  const deferredPlaces = useDeferredValue(filteredPlaces);

  const clustered = useMemo(
    () => clusterPlacesForRegion(deferredPlaces, deferredRegion),
    [deferredPlaces, deferredRegion],
  );

  useEffect(() => {
    const broadcast = filteredPlaces.slice(0, 80).map((place) => ({
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      categories: place.tags?.length ? place.tags : place.categories ?? [],
      address: place.address ?? null,
      locality: place.locality ?? null,
      highlightedCategory: resolvePrimaryCategoryKey(place, filters.categories),
    }));
    emitMapPlacesUpdated(broadcast);
  }, [filteredPlaces, filters.categories]);

  const placesCountLabel = useMemo(() => {
    if (loading && !filteredPlaces.length) return null;
    if (!filteredPlaces.length) return 'No places in view';
    return `${filteredPlaces.length} place${filteredPlaces.length === 1 ? '' : 's'} in view`;
  }, [filteredPlaces.length, loading]);

  const hasActiveFilters = activeFilterCount > 0;

  const noResultsMessage = useMemo(() => {
    if (loading || filteredPlaces.length || !hasActiveFilters) return null;
    if (filters.categories.length) {
      const labels = filters.categories.map((key) => formatCategoryName(key, categoryLabelByKey));
      const labelText = joinWithLimit(labels, 2);
      return `No ${labelText} places match these filters here yet. Try adjusting the filters or moving the map.`;
    }
    return 'No places match the selected filters here yet. Try adjusting the filters or moving the map.';
  }, [loading, filteredPlaces.length, hasActiveFilters, filters.categories, categoryLabelByKey]);

  const providerHint = useMemo(() => {
    if (!filteredPlaces.length) return null;
    if (providerCounts.foursquare === 0 && providerCounts.google_places === 0) {
      return 'Showing OpenStreetMap venues. Add Foursquare or Google Places keys to broaden results.';
    }
    return null;
  }, [filteredPlaces.length, providerCounts]);

  const toggleCategory = (category: string) => {
    if (!cityCategoryMap.has(category)) return;
    setFilters((prev) => {
      const exists = prev.categories.includes(category);
      const nextCategories = exists
        ? prev.categories.filter((value) => value !== category)
        : [...prev.categories, category];
      return { ...prev, categories: nextCategories };
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
    setFilters(cloneFilters(draftFilters));
    setFilterModalVisible(false);
  };

  const resetDraftFilters = () => {
    setDraftFilters(cloneFilters(DEFAULT_FILTERS));
  };

  const toggleDraftCategory = (category: string) => {
    if (!cityCategoryMap.has(category)) return;
    setDraftFilters((prev) => {
      const exists = prev.categories.includes(category);
      const nextCategories = exists
        ? prev.categories.filter((value) => value !== category)
        : [...prev.categories, category];
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

  useEffect(() => {
    lastRegionRef.current = region;
  }, [region]);

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
                <View style={styles.modalChipGroup}>
                  {categoryOptions.map((option) => {
                    const active = draftFilters.categories.includes(option.key);
                    return (
                      <TouchableOpacity
                        key={`modal-${option.key}`}
                        onPress={() => toggleDraftCategory(option.key)}
                        style={[styles.modalChip, active ? styles.modalChipActive : styles.modalChipInactive]}
                      >
                        <Text style={active ? styles.modalChipTextActive : styles.modalChipText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
          {categoryOptions.map((option) => {
            const active = filters.categories.includes(option.key);
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => toggleCategory(option.key)}
                style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipInactive]}
              >
                <Text style={active ? styles.filterChipTextActive : styles.filterChipText}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFillObject}
          initialRegion={region}
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
            const appearance = resolveCategoryAppearance(place, filters.categories);
            const primaryCategoryKey = resolvePrimaryCategoryKey(place, filters.categories);
            const descriptionLabel = primaryCategoryKey
              ? formatCategoryName(primaryCategoryKey, categoryLabelByKey)
              : place.categories[0]
                ? formatCategoryName(place.categories[0], categoryLabelByKey)
                : 'Activity';
            const addressLabel = formatPlaceAddress(place);
            const calloutDescription = addressLabel
              ? [addressLabel, descriptionLabel !== 'Activity' ? descriptionLabel : null]
                  .filter(Boolean)
                  .join('\n')
              : descriptionLabel;
            return (
              <Marker
                key={place.id}
                coordinate={coordinate}
                onPress={() => {
                  handleMarkerPress(place, coordinate);
                  handlePlanEvent(place, descriptionLabel);
                }}
                title={place.name}
                description={calloutDescription}
              >
                <View
                  style={[
                    styles.marker,
                    { backgroundColor: appearance.color },
                  ]}
                >
                  <Text style={styles.markerEmoji}>{appearance.emoji}</Text>
                </View>
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

      </View>
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {attributions.length
            ? `Data from ${attributions.map((attr) => attr.text).join(', ')}`
            : 'Data from OpenStreetMap and Foursquare Places.'}
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
    paddingVertical: 12,
    columnGap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipActive: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  filterChipInactive: {
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
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
  markerEmoji: {
    fontSize: 18,
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
