"use client";

type ActivityMetadataChip = { key: string; label: string; icon?: string };
type MapToast = { message: string; tone: 'success' | 'info' | 'error' };

import { useQueryClient } from '@tanstack/react-query';
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_RADIUS_METERS,
  createEventsFetcher,
  createNearbyActivitiesFetcher,
  formatEventTimeRange,
  getEventSessionId,
  sortEventsByStart,
  trackAnalyticsEvent,
  type EventSummary,
  type MapActivity,
  type MapCoordinates,
  mapActivitiesQueryKey,
  useEvents,
  useNearbyActivities,
  DEFAULT_MAP_FILTER_PREFERENCES,
  normaliseMapFilterPreferences,
  mapPreferencesToQueryFilters,
  type MapFilterPreferences,
  loadUserPreference,
  saveUserPreference,
  isUuid,
  type CapacityFilterKey,
  type DiscoveryTrustMode,
  type TimeWindowKey,
} from "@dowhat/shared";
import SaveToggleButton from "@/components/SaveToggleButton";
import PlaceBrandMark from "@/components/PlaceBrandMark";

import WebMap, { type MapMovePayload, type ViewBounds } from "@/components/WebMap";
import { PLACE_FALLBACK_LABEL, normalizePlaceLabel } from '@/lib/places/labels';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';
import { haversineMeters } from '@/lib/places/utils';
import { supabase } from "@/lib/supabase/browser";
import { buildMapActivitySavePayload as createMapActivitySavePayload } from "@/lib/savePayloads";
import { useCoreAccessGuard } from '@/lib/access/useCoreAccessGuard';
import { parseCoordinateLabel, resolveMapCenterFromProfile, type MapProfileLocationPayload } from './profileCenter';
import {
  clampReliabilityScore,
  describeEventOrigin,
  describeEventPrimaryAction,
  describeEventState,
  describeEventVerification,
  describeReliabilityConfidence,
  eventPlaceLabel,
  eventStateClass,
  eventVerificationClass,
  reliabilityBarClass,
  buildEventVerificationProgress,
  formatReliabilityLabel,
} from "@/lib/events/presentation";
import { useStableNearbyData } from './useStableNearbyData';
import { extractActivitySearchTokens, extractSearchPhrases, extractStructuredActivityTokens } from './searchTokens';
import { matchesActivitySearch } from './searchMatching';
import { resolveMapCenterFromSession } from './highlightSession';
import { dedupeNearDuplicateActivities, hasTypeIntentMatch, isGenericActivityDisplay, pruneLowQualitySearchActivities } from './resultQuality';
import { encodeActivityParam, resolveFocusedActivitySync } from './focusedActivitySync';

const FALLBACK_CENTER: MapCoordinates = { lat: 51.5074, lng: -0.1278 }; // London default
const EMPTY_ACTIVITIES: MapActivity[] = [];
const EMPTY_EVENTS: EventSummary[] = [];
const EMPTY_STRING_LIST: string[] = [];
const EMPTY_FACETS: Array<{ value: string; count: number }> = [];
const MAP_FILTERS_LOCAL_KEY = "map_filters:v1";
const MAP_FILTERS_VERSION = 3;
const MOVE_END_DEBOUNCE_MS = 250;
const CENTER_UPDATE_THRESHOLD = 0.0005;
const BOUNDS_UPDATE_THRESHOLD = 0.0008;
const EVENTS_QUERY_COORD_PRECISION = 3;
const MAP_NEARBY_LIMIT = 1200;
const MAP_SEARCH_AUGMENT_LIMIT = 2000;
const MAP_SPARSE_RESULTS_THRESHOLD = 8;
const MAP_EVENTS_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const MAP_NEARBY_FETCH_TIMEOUT_MS = 20_000;

type CapacityOption = { key: CapacityFilterKey; label: string };
type TimeWindowOption = { key: TimeWindowKey; label: string };
type TrustOption = { key: DiscoveryTrustMode; label: string; helper: string };

const PRICE_LEVEL_OPTIONS: Array<{ level: number; label: string }> = [
  { level: 1, label: '$' },
  { level: 2, label: '$$' },
  { level: 3, label: '$$$' },
  { level: 4, label: '$$$$' },
];

const CAPACITY_OPTIONS: CapacityOption[] = [
  { key: 'any', label: 'Any group size' },
  { key: 'couple', label: '2+ people' },
  { key: 'small', label: '5+ people' },
  { key: 'medium', label: '8+ people' },
  { key: 'large', label: '10+ people' },
];

const TIME_WINDOW_OPTIONS: TimeWindowOption[] = [
  { key: 'any', label: 'Any time' },
  { key: 'open_now', label: 'Open now' },
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'late', label: 'Late night' },
];

const TRUST_OPTIONS: TrustOption[] = [
  { key: 'all', label: 'All results', helper: 'Show every eligible activity or event in this map area.' },
  { key: 'verified_only', label: 'Confirmed only', helper: 'Keep the strongest confirmed results and hide suggestion-first matches.' },
  { key: 'ai_only', label: 'Suggestions only', helper: 'Inspect early leads that still need stronger confirmation.' },
];

const CAPACITY_OPTION_BY_KEY = new Map<CapacityFilterKey, CapacityOption>(
  CAPACITY_OPTIONS.map((option) => [option.key, option]),
);

const TIME_WINDOW_OPTION_BY_KEY = new Map<TimeWindowKey, TimeWindowOption>(
  TIME_WINDOW_OPTIONS.map((option) => [option.key, option]),
);

const TRUST_OPTION_BY_KEY = new Map<DiscoveryTrustMode, TrustOption>(
  TRUST_OPTIONS.map((option) => [option.key, option]),
);

const formatPriceLevelLabel = (level: number): string => {
  const clamped = Math.min(Math.max(1, Math.round(level)), PRICE_LEVEL_OPTIONS.length);
  const match = PRICE_LEVEL_OPTIONS.find((option) => option.level === clamped);
  return match?.label ?? '$'.repeat(clamped);
};

const formatTaxonomyLabel = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizePriceLevels = (values?: readonly (number | null | undefined)[]): number[] => {
  if (!values || !values.length) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), PRICE_LEVEL_OPTIONS.length) : null))
        .filter((value): value is number => value != null),
    ),
  ).sort((a, b) => a - b);
};

const mergeStringFilterOptions = (available: readonly string[], selected: readonly string[]): string[] =>
  Array.from(new Set([...available, ...selected].map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

const buildActivityMetadataChips = (activity: MapActivity): ActivityMetadataChip[] => {
  const chips: ActivityMetadataChip[] = [];
  const priceLevels = normalizePriceLevels(activity.price_levels ?? undefined);
  if (priceLevels.length) {
    const minLabel = formatPriceLevelLabel(priceLevels[0]);
    const maxLabel = formatPriceLevelLabel(priceLevels[priceLevels.length - 1]);
    const label = priceLevels.length === 1 ? `Price ${minLabel}` : `Price ${minLabel} – ${maxLabel}`;
    chips.push({ key: 'price', label, icon: '💸' });
  }
  if (activity.capacity_key && activity.capacity_key !== 'any') {
    const option = CAPACITY_OPTION_BY_KEY.get(activity.capacity_key as CapacityFilterKey);
    const label = option?.label ?? `Group ${activity.capacity_key}`;
    chips.push({ key: `capacity:${activity.capacity_key}`, label, icon: '👥' });
  }
  if (activity.time_window && activity.time_window !== 'any') {
    const option = TIME_WINDOW_OPTION_BY_KEY.get(activity.time_window as TimeWindowKey);
    const label = option?.label ?? formatTaxonomyLabel(activity.time_window);
    chips.push({ key: `time:${activity.time_window}`, label, icon: '🕒' });
  }
  const taxonomy = (activity.taxonomy_categories ?? [])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  if (taxonomy.length) {
    taxonomy.slice(0, 2).forEach((value, index) => {
      chips.push({ key: `taxonomy:${value}:${index}`, label: formatTaxonomyLabel(value), icon: '🏷️' });
    });
    if (taxonomy.length > 2) {
      chips.push({ key: 'taxonomy:overflow', label: `+${taxonomy.length - 2} more categories` });
    }
  }
  return chips;
};

const activityPlaceLabel = (activity: MapActivity): string => {
  const label = normalizePlaceLabel(activity.place_label, activity.venue);
  return label === PLACE_FALLBACK_LABEL ? PLACE_FALLBACK_LABEL : label;
};

type StoredMapFilters = MapFilterPreferences & { version?: number };

const sanitizeVisibleMapFilters = (prefs?: MapFilterPreferences | null): MapFilterPreferences => {
  const normalized = normaliseMapFilterPreferences(prefs);
  return {
    ...normalized,
    priceLevels: [],
    capacityKey: 'any',
    timeWindow: 'any',
  };
};

const isCurrentMapFilters = (value: unknown): value is StoredMapFilters => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const version = (value as StoredMapFilters).version ?? null;
  return version === MAP_FILTERS_VERSION;
};

const readLocalMapFilters = (): MapFilterPreferences | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MAP_FILTERS_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCurrentMapFilters(parsed)) return null;
    return sanitizeVisibleMapFilters(parsed as MapFilterPreferences);
  } catch (error) {
    console.warn("[map] unable to parse cached map filters", error);
    return null;
  }
};

const writeLocalMapFilters = (prefs: MapFilterPreferences) => {
  if (typeof window === "undefined") return;
  try {
    const normalised = sanitizeVisibleMapFilters(prefs);
    const payload = { ...normalised, version: MAP_FILTERS_VERSION };
    window.localStorage.setItem(MAP_FILTERS_LOCAL_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[map] unable to cache map filters locally", error);
  }
};

const resolveStoredMapFilters = (value: unknown): MapFilterPreferences | null => {
  if (!isCurrentMapFilters(value)) return null;
  return sanitizeVisibleMapFilters(value as MapFilterPreferences);
};

const formatKilometres = (meters?: number | null) => {
  if (!meters || meters <= 0) return "<0.5 km";
  const km = meters / 1000;
  if (km < 1) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km * 10) / 10} km`;
};

const isWithinRadius = (
  center: MapCoordinates | null,
  radiusMeters: number,
  lat?: number | null,
  lng?: number | null,
  fallbackDistance?: number | null,
): boolean => {
  const epsilonMeters = 50;
  const maxDistance = radiusMeters + epsilonMeters;
  const finiteFallback = typeof fallbackDistance === 'number' && Number.isFinite(fallbackDistance)
    ? fallbackDistance
    : null;

  if (!center) {
    return finiteFallback == null || finiteFallback <= maxDistance;
  }

  if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
    return haversineMeters(center.lat, center.lng, lat, lng) <= maxDistance;
  }

  return finiteFallback == null || finiteFallback <= maxDistance;
};

type Bounds = ViewBounds;
type MovePayload = MapMovePayload;

type ToggleOption = "map" | "list";
type FilterChip = { key: string; label: string; onRemove: () => void };
type FilterSupportFlags = {
  activityTypes: boolean;
  tags: boolean;
  traits: boolean;
  taxonomyCategories: boolean;
  priceLevels: boolean;
  capacityKey: boolean;
  timeWindow: boolean;
};

const EMPTY_FILTER_SUPPORT: FilterSupportFlags = {
  activityTypes: false,
  tags: false,
  traits: false,
  taxonomyCategories: false,
  priceLevels: false,
  capacityKey: false,
  timeWindow: false,
};

const roundCoordinate = (value: number, precision = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(precision)) : 0;

const resolveActivityVerificationState = (activity: MapActivity): 'suggested' | 'verified' | 'needs_votes' => {
  if (activity.verification_state === 'verified') return 'verified';
  if (activity.verification_state === 'needs_votes') return 'needs_votes';
  if (activity.verification_state === 'suggested') return 'suggested';
  const tags = new Set((activity.tags ?? []).filter((value): value is string => typeof value === 'string'));
  if (tags.has('verified')) return 'verified';
  if (tags.has('needs_votes') || tags.has('needs_verification')) return 'needs_votes';
  return 'suggested';
};

const activityVerificationLabel = (activity: MapActivity): string => {
  const state = resolveActivityVerificationState(activity);
  if (state === 'verified') return 'Verified';
  if (state === 'needs_votes') return 'Needs votes';
  return 'Suggested';
};

const activityVerificationClass = (activity: MapActivity): string => {
  const state = resolveActivityVerificationState(activity);
  if (state === 'verified') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (state === 'needs_votes') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-slate-300 bg-slate-100 text-slate-700';
};

const formatTrustPercent = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
};

const normaliseBounds = (value: Bounds): Bounds => ({
  sw: { lat: roundCoordinate(value.sw.lat, 5), lng: roundCoordinate(value.sw.lng, 5) },
  ne: { lat: roundCoordinate(value.ne.lat, 5), lng: roundCoordinate(value.ne.lng, 5) },
});

const boundsCoordinateEqual = (a: number, b: number, epsilon = BOUNDS_UPDATE_THRESHOLD): boolean =>
  Math.abs(a - b) <= epsilon;

const boundsEqual = (a: Bounds | null, b: Bounds | null): boolean => {
  if (!a || !b) return false;
  return (
    boundsCoordinateEqual(a.sw.lat, b.sw.lat)
    && boundsCoordinateEqual(a.sw.lng, b.sw.lng)
    && boundsCoordinateEqual(a.ne.lat, b.ne.lat)
    && boundsCoordinateEqual(a.ne.lng, b.ne.lng)
  );
};

const normaliseEventQueryBounds = (value: Bounds): Bounds => ({
  sw: {
    lat: roundCoordinate(value.sw.lat, EVENTS_QUERY_COORD_PRECISION),
    lng: roundCoordinate(value.sw.lng, EVENTS_QUERY_COORD_PRECISION),
  },
  ne: {
    lat: roundCoordinate(value.ne.lat, EVENTS_QUERY_COORD_PRECISION),
    lng: roundCoordinate(value.ne.lng, EVENTS_QUERY_COORD_PRECISION),
  },
});

const buildBoundsAroundCenter = (center: MapCoordinates, radiusMeters: number): Bounds => {
  const earthMetersPerLatDegree = 111_320;
  const latDelta = radiusMeters / earthMetersPerLatDegree;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const safeCos = Math.max(0.2, Math.abs(cosLat));
  const lngDelta = radiusMeters / (earthMetersPerLatDegree * safeCos);

  return {
    sw: {
      lat: center.lat - latDelta,
      lng: center.lng - lngDelta,
    },
    ne: {
      lat: center.lat + latDelta,
      lng: center.lng + lngDelta,
    },
  };
};

const normaliseRadiusMeters = (value: number) => {
  const clamped = Math.max(300, Math.min(25_000, Number.isFinite(value) ? value : DEFAULT_RADIUS_METERS));
  const bucket = 250;
  return Math.round(clamped / bucket) * bucket;
};

export default function MapPage() {
  const [center, setCenter] = useState<MapCoordinates | null>(null);
  const [queryCenter, setQueryCenter] = useState<MapCoordinates | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [viewMode, setViewMode] = useState<ToggleOption>("map");
  const [dataMode, setDataMode] = useState<'activities' | 'events' | 'both'>("both");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [copiedActivityLink, setCopiedActivityLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<MapToast | null>(null);
  const [filters, setFilters] = useState<MapFilterPreferences>(() => sanitizeVisibleMapFilters(DEFAULT_MAP_FILTER_PREFERENCES));
  const [useTagsForActivityTypes, setUseTagsForActivityTypes] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationErrored, setLocationErrored] = useState(false);
  const [lastFilterSupport, setLastFilterSupport] = useState<FilterSupportFlags | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = useMemo(() => searchParams?.toString() ?? '', [searchParams]);
  const debugDiscovery =
    searchParams?.get('debug') === '1'
    || searchParams?.get('debugDiscovery') === '1'
    || process.env.NEXT_PUBLIC_DISCOVERY_DEBUG === '1';
  const e2eBypassAuth =
    process.env.NEXT_PUBLIC_E2E_ADMIN_BYPASS === 'true'
    && searchParams?.get('e2e') === '1';
  const redirectTarget = useMemo(() => {
    if (!pathname) return '/map';
    return searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
  }, [pathname, searchParamsString]);
  const coreAccessState = useCoreAccessGuard(redirectTarget, { bypass: e2eBypassAuth });
  const highlightSessionId = searchParams?.get('highlightSession');
  const [storedHighlightSessionId, setStoredHighlightSessionId] = useState<string | null>(null);
  const effectiveHighlightSessionId = highlightSessionId ?? storedHighlightSessionId;
  const attemptedHighlightFetchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (highlightSessionId) {
      setStoredHighlightSessionId(null);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem('dowhat:last-created-session');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; createdAt?: number };
      const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
      const createdAt = typeof parsed?.createdAt === 'number' ? parsed.createdAt : 0;
      const isFresh = createdAt > 0 && Date.now() - createdAt < 24 * 60 * 60 * 1000;
      if (id && isFresh) {
        setStoredHighlightSessionId(id);
      }
    } catch {
      // ignore storage parse failures
    }
  }, [highlightSessionId]);
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);
  const [preferencesInitialised, setPreferencesInitialised] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const centerRef = useRef<MapCoordinates | null>(center);
  const queryCenterRef = useRef<MapCoordinates | null>(queryCenter);
  const radiusRef = useRef(radiusMeters);
  const boundsRef = useRef<Bounds | null>(bounds);
  const dataModeRef = useRef(dataMode);
  const lastSyncedActivityIdRef = useRef<string | null>(searchParams?.get('activity') ?? null);
  const pendingActivityParamSyncRef = useRef<string | null>(null);
  const centeredForActivityIdRef = useRef<string | null>(null);
  const primeCenter = useCallback((next: MapCoordinates) => {
    centerRef.current = next;
    queryCenterRef.current = next;
    setCenter(next);
    setQueryCenter(next);
  }, []);
  const updateFilters = useCallback(
    (updater: (prev: MapFilterPreferences) => MapFilterPreferences) => {
      setFilters((prev) => sanitizeVisibleMapFilters(updater(prev)));
    },
    [],
  );

  type FocusHistoryMode = 'replace' | 'push';

  const syncFocusedActivityParam = useCallback(
    (nextId: string | null, mode: FocusHistoryMode = 'replace') => {
      if (!pathname) return;
      const params = new URLSearchParams(searchParamsString);
      const previous = params.get('activity');
      const noChange = nextId ? previous === nextId : previous == null;
      if (noChange && lastSyncedActivityIdRef.current === nextId) {
        return;
      }
      if (nextId) {
        params.set('activity', nextId);
      } else {
        params.delete('activity');
      }
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      const navigate = mode === 'push' ? router.push : router.replace;
      lastSyncedActivityIdRef.current = nextId;
      pendingActivityParamSyncRef.current = encodeActivityParam(nextId);
      navigate(nextUrl as Route, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const showToast = useCallback((message: string, tone: MapToast['tone'] = 'success') => {
    setToastMessage({ message, tone });
  }, []);

  const selectedActivityTypes = useMemo(
    () => filters.activityTypes ?? EMPTY_STRING_LIST,
    [filters.activityTypes],
  );
  const selectedTraits = useMemo(
    () => filters.traits ?? EMPTY_STRING_LIST,
    [filters.traits],
  );
  const selectedTaxonomyCategories = useMemo(
    () => filters.taxonomyCategories ?? EMPTY_STRING_LIST,
    [filters.taxonomyCategories],
  );
  const selectedTrustMode = filters.trustMode ?? 'all';

  type StringListUpdater = string[] | ((prev: string[]) => string[]);

  const setSelectedActivityTypes = useCallback(
    (updater: StringListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        activityTypes: typeof updater === 'function' ? (updater as (prev: string[]) => string[])(prev.activityTypes) : updater,
      }));
    },
    [updateFilters],
  );

  const setSelectedTraits = useCallback(
    (updater: StringListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        traits: typeof updater === 'function' ? (updater as (prev: string[]) => string[])(prev.traits) : updater,
      }));
    },
    [updateFilters],
  );

  const setSelectedTaxonomyCategories = useCallback(
    (updater: StringListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        taxonomyCategories:
          typeof updater === 'function' ? (updater as (prev: string[]) => string[])(prev.taxonomyCategories) : updater,
      }));
    },
    [updateFilters],
  );

  const setTrustMode = useCallback(
    (next: DiscoveryTrustMode) => {
      updateFilters((prev) => ({
        ...prev,
        trustMode: next,
      }));
    },
    [updateFilters],
  );

  const filtersForQuery = useMemo(() => {
    const mapped = mapPreferencesToQueryFilters(filters);
    if (!mapped && !searchTerm.trim()) return undefined;

    let result = mapped ? { ...mapped } : undefined;
    if (searchTerm.trim()) {
      result = {
        ...(result ?? {}),
        searchText: searchTerm,
      };
    }
    if (useTagsForActivityTypes && result?.activityTypes?.length) {
      const activityTypes = result.activityTypes;
      delete result.activityTypes;
      result = {
        ...result,
        tags: activityTypes,
      };
    }

    if (lastFilterSupport && result) {
      const next = { ...result };
      let changed = false;
      if (next.activityTypes && lastFilterSupport.activityTypes === false) {
        delete next.activityTypes;
        changed = true;
      }
      if (next.tags && lastFilterSupport.tags === false) {
        delete next.tags;
        changed = true;
      }
      if (next.peopleTraits && lastFilterSupport.traits === false) {
        delete next.peopleTraits;
        changed = true;
      }
      if (next.taxonomyCategories && lastFilterSupport.taxonomyCategories === false) {
        delete next.taxonomyCategories;
        changed = true;
      }
      if (next.priceLevels && lastFilterSupport.priceLevels === false) {
        delete next.priceLevels;
        changed = true;
      }
      if (next.capacityKey && lastFilterSupport.capacityKey === false) {
        delete next.capacityKey;
        changed = true;
      }
      if (next.timeWindow && lastFilterSupport.timeWindow === false) {
        delete next.timeWindow;
        changed = true;
      }
      if (changed) {
        result = Object.keys(next).length ? next : undefined;
      }
    }

    return result && Object.keys(result).length ? result : undefined;
  }, [filters, lastFilterSupport, searchTerm, useTagsForActivityTypes]);

  const hydrateAnonymousPreferences = useCallback(() => {
    const next = readLocalMapFilters() ?? sanitizeVisibleMapFilters(DEFAULT_MAP_FILTER_PREFERENCES);
    updateFilters(() => next);
    setPreferencesUserId(null);
    setPreferencesInitialised(true);
  }, [updateFilters]);

  const loadPreferencesForUser = useCallback(
    async (userId: string) => {
      try {
        const remote = await loadUserPreference<StoredMapFilters>(supabase, userId, "map_filters");
        const resolvedRemote = resolveStoredMapFilters(remote);
        if (resolvedRemote) {
          updateFilters(() => resolvedRemote);
          writeLocalMapFilters(resolvedRemote);
        } else {
          const fallback = readLocalMapFilters();
          const next = fallback ?? sanitizeVisibleMapFilters(DEFAULT_MAP_FILTER_PREFERENCES);
          updateFilters(() => next);
        }
        setPreferencesUserId(userId);
      } catch (error) {
        console.warn("[map] failed to load map filters", error);
        const fallback = readLocalMapFilters();
        if (fallback) {
          updateFilters(() => fallback);
        }
        setPreferencesUserId(userId);
      } finally {
        setPreferencesInitialised(true);
      }
    },
    [updateFilters],
  );

  const persistPreferences = useCallback(
    async (next: MapFilterPreferences) => {
      const normalised = sanitizeVisibleMapFilters(next);
      writeLocalMapFilters(normalised);
      if (preferencesUserId) {
        try {
          const payload = { ...normalised, version: MAP_FILTERS_VERSION };
          await saveUserPreference(supabase, preferencesUserId, "map_filters", payload);
        } catch (error) {
          console.warn("[map] failed to persist map filters", error);
        }
      }
    },
    [preferencesUserId],
  );

  useEffect(() => {
    if (!preferencesInitialised) return;
    void persistPreferences(filters);
  }, [filters, persistPreferences, preferencesInitialised]);

  useEffect(() => {
    if (isAuthenticated !== true && !e2eBypassAuth) return;
    let cancelled = false;

    const applyProfileCenter = async (): Promise<boolean> => {
      try {
        const profileResponse = await fetch('/api/profile/me', { cache: 'no-store' });
        if (!profileResponse.ok) return false;
        const profile = (await profileResponse.json()) as MapProfileLocationPayload;
        let profileCenter = resolveMapCenterFromProfile(profile);

        if (!profileCenter && typeof profile.location === 'string' && profile.location.trim().length > 1) {
          const coordinateLabel = parseCoordinateLabel(profile.location);
          if (coordinateLabel) {
            profileCenter = coordinateLabel;
          } else {
            const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(profile.location)}&limit=1`);
            if (geocodeResponse.ok) {
              const payload = (await geocodeResponse.json()) as { lat?: number; lng?: number };
              if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
                profileCenter = {
                  lat: Number(payload.lat.toFixed(6)),
                  lng: Number(payload.lng.toFixed(6)),
                };
              }
            }
          }
        }

        if (!profileCenter || cancelled) return false;
        primeCenter(profileCenter);
        setLocationErrored(false);
        return true;
      } catch (error) {
        console.warn('[map] unable to hydrate center from profile location', error);
        return false;
      }
    };

    const applyDeviceOrFallbackCenter = () => {
      const fallback = () => {
        if (!cancelled && !centerRef.current) {
          primeCenter(FALLBACK_CENTER);
        }
      };

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            if (cancelled) return;
            primeCenter({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
          },
          () => {
            setLocationErrored(true);
            fallback();
          },
          { enableHighAccuracy: true, timeout: 7000 },
        );
      } else {
        fallback();
      }
      const timeout = setTimeout(fallback, 4000);
      return timeout;
    };

    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      const profileApplied = await applyProfileCenter();
      if (!profileApplied) {
        fallbackTimeout = applyDeviceOrFallbackCenter();
      }
    })();

    return () => {
      cancelled = true;
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };
  }, [e2eBypassAuth, isAuthenticated, primeCenter]);

  useEffect(() => {
    if (!center) return;
    setBounds((prev) => {
      if (prev) return prev;
      const delta = 0.02;
      return {
        sw: { lat: center.lat - delta, lng: center.lng - delta },
        ne: { lat: center.lat + delta, lng: center.lng + delta },
      };
    });
  }, [center]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const userId = data.user?.id ?? null;
        setIsAuthenticated(e2eBypassAuth ? true : Boolean(userId));
        if (userId) {
          if (preferencesUserId !== userId) {
            await loadPreferencesForUser(userId);
          }
        } else {
          hydrateAnonymousPreferences();
        }
      } catch (error) {
        console.warn('[map] unable to resolve auth session', error);
        if (mounted) {
          setIsAuthenticated(e2eBypassAuth ? true : false);
          hydrateAnonymousPreferences();
        }
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const userId = session?.user?.id ?? null;
      setIsAuthenticated(e2eBypassAuth ? true : Boolean(userId));
      if (userId) {
        await loadPreferencesForUser(userId);
      } else {
        hydrateAnonymousPreferences();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      mounted = false;
    };
  }, [e2eBypassAuth, hydrateAnonymousPreferences, loadPreferencesForUser, preferencesUserId]);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    queryCenterRef.current = queryCenter;
  }, [queryCenter]);

  useEffect(() => {
    radiusRef.current = radiusMeters;
  }, [radiusMeters]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    dataModeRef.current = dataMode;
  }, [dataMode]);

  useEffect(() => {
    if (!copiedActivityLink) return;
    const timeout = setTimeout(() => setCopiedActivityLink(false), 2000);
    return () => clearTimeout(timeout);
  }, [copiedActivityLink]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const fetcher = useMemo(
    () =>
      createNearbyActivitiesFetcher({
        buildUrl: () => {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          if (!origin) throw new Error('Unable to determine origin for nearby fetcher');
          return debugDiscovery ? `${origin}/api/nearby?debug=1` : `${origin}/api/nearby`;
        },
        includeCredentials: true,
        timeoutMs: MAP_NEARBY_FETCH_TIMEOUT_MS,
      }),
    [debugDiscovery],
  );

  const eventsFetcher = useMemo(
    () =>
      createEventsFetcher({
        buildUrl: () => {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          if (!origin) throw new Error("Unable to determine origin for events endpoint");
          return `${origin}/api/events`;
        },
        includeCredentials: true,
      }),
    [],
  );

  const track = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      trackAnalyticsEvent(event, { platform: "web", ...payload });
    },
    [],
  );

  const accessAllowed = isAuthenticated === true;
  const query = useMemo(
    () =>
      accessAllowed && queryCenter
        ? {
            center: queryCenter,
            radiusMeters,
            limit: MAP_NEARBY_LIMIT,
            filters: filtersForQuery,
            bounds: bounds ?? undefined,
          }
        : null,
    [accessAllowed, queryCenter, radiusMeters, filtersForQuery, bounds],
  );

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const hasQueryFilterConstraints = useMemo(() => {
    const next = query?.filters;
    if (!next) return false;
    return Boolean(
      (next.activityTypes?.length ?? 0)
      || (next.tags?.length ?? 0)
      || (next.peopleTraits?.length ?? 0)
      || (next.taxonomyCategories?.length ?? 0)
      || (next.priceLevels?.length ?? 0)
      || next.capacityKey
      || next.timeWindow
      || next.searchText,
    );
  }, [query?.filters]);
  const searchActivityTokens = useMemo(
    () => extractActivitySearchTokens(normalizedSearchTerm),
    [normalizedSearchTerm],
  );

  const filteredAugmentedQuery = useMemo(() => {
    if (!query) return null;
    if (normalizedSearchTerm) return null;
    if (!hasQueryFilterConstraints) return null;

    return {
      ...query,
      radiusMeters: Math.max(query.radiusMeters, 25_000),
      limit: Math.max(query.limit, MAP_SEARCH_AUGMENT_LIMIT),
    };
  }, [query, normalizedSearchTerm, hasQueryFilterConstraints]);

  const searchAugmentedQuery = useMemo(() => {
    if (!query) return null;
    if (!normalizedSearchTerm) return null;

    return {
      ...query,
      radiusMeters: Math.max(query.radiusMeters, 25_000),
      limit: Math.max(query.limit, MAP_SEARCH_AUGMENT_LIMIT),
    };
  }, [query, normalizedSearchTerm]);

  const searchAugmentedTypeQuery = useMemo(() => {
    if (!query) return null;
    if (!normalizedSearchTerm) return null;
    if (!searchActivityTokens.length) return null;

    const baseFilters = query.filters ?? {};
    const activityTypes = Array.from(new Set([...(baseFilters.activityTypes ?? []), ...searchActivityTokens]));

    return {
      ...query,
      radiusMeters: Math.max(query.radiusMeters, 25_000),
      limit: Math.max(query.limit, MAP_SEARCH_AUGMENT_LIMIT),
      filters: {
        ...baseFilters,
        activityTypes,
      },
    };
  }, [query, normalizedSearchTerm, searchActivityTokens]);

  const loadActivities = accessAllowed && dataMode !== 'events';
  const loadEvents = accessAllowed && dataMode !== 'activities';

  const nearby = useNearbyActivities(query, {
    fetcher,
    enabled: Boolean(query) && loadActivities,
    placeholderData: (previous) => previous,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      const message = error?.message?.toLowerCase() ?? '';
      if (message.includes('lat and lng') || message.includes('required') || message.includes('not defined')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const nearbySearch = useNearbyActivities(searchAugmentedQuery, {
    fetcher,
    enabled: Boolean(searchAugmentedQuery) && loadActivities,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const nearbySearchByType = useNearbyActivities(searchAugmentedTypeQuery, {
    fetcher,
    enabled: Boolean(searchAugmentedTypeQuery) && loadActivities,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const nearbyFilteredAugment = useNearbyActivities(filteredAugmentedQuery, {
    fetcher,
    enabled: Boolean(filteredAugmentedQuery) && loadActivities,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const stableNearby = useStableNearbyData(nearby);
  const nearbyData = stableNearby.data ?? nearby.data ?? null;

  const searchActivities = nearbySearch.data?.activities ?? EMPTY_ACTIVITIES;
  const searchTypeActivities = nearbySearchByType.data?.activities ?? EMPTY_ACTIVITIES;
  const filteredAugmentActivities = nearbyFilteredAugment.data?.activities ?? EMPTY_ACTIVITIES;
  const activities = useMemo(() => {
    if (!searchActivities.length && !searchTypeActivities.length && !filteredAugmentActivities.length) {
      return nearbyData?.activities ?? EMPTY_ACTIVITIES;
    }
    const merged = new Map<string, MapActivity>();
    for (const activity of nearbyData?.activities ?? EMPTY_ACTIVITIES) {
      merged.set(activity.id, activity);
    }
    for (const activity of searchActivities) {
      merged.set(activity.id, activity);
    }
    for (const activity of searchTypeActivities) {
      merged.set(activity.id, activity);
    }
    for (const activity of filteredAugmentActivities) {
      merged.set(activity.id, activity);
    }
    return Array.from(merged.values());
  }, [nearbyData?.activities, searchActivities, searchTypeActivities, filteredAugmentActivities]);
  const filterSupport = nearbyData?.filterSupport ?? null;
  const effectiveFilterSupport = filterSupport ?? lastFilterSupport ?? EMPTY_FILTER_SUPPORT;
  const facets = nearbyData?.facets ?? null;
  const facetActivityTypes = useMemo(
    () => facets?.activityTypes ?? EMPTY_FACETS,
    [facets?.activityTypes],
  );
  const facetTags = useMemo(
    () => facets?.tags ?? EMPTY_FACETS,
    [facets?.tags],
  );
  const facetTraits = useMemo(
    () => facets?.traits ?? EMPTY_FACETS,
    [facets?.traits],
  );
  const facetTaxonomyCategories = useMemo(
    () => facets?.taxonomyCategories ?? EMPTY_FACETS,
    [facets?.taxonomyCategories],
  );
  const activityTypesSupported = effectiveFilterSupport.activityTypes;
  const tagsSupported = effectiveFilterSupport.tags;
  const traitsSupported = effectiveFilterSupport.traits;
  const taxonomyCategoriesSupported = effectiveFilterSupport.taxonomyCategories;

  useEffect(() => {
    if (!filterSupport) return;
    setLastFilterSupport(filterSupport);
    if (!filterSupport.activityTypes && filterSupport.tags) {
      setUseTagsForActivityTypes(true);
    } else if (filterSupport.activityTypes) {
      setUseTagsForActivityTypes(false);
    }
  }, [filterSupport]);

  useEffect(() => {
    if (!loadActivities || !filterSupport) return;

    const filtersToClear: string[] = [];
    if (!filterSupport.activityTypes && selectedActivityTypes.length) filtersToClear.push('activityTypes');
    if (!filterSupport.traits && selectedTraits.length) filtersToClear.push('peopleTraits');
    if (!filterSupport.taxonomyCategories && selectedTaxonomyCategories.length) filtersToClear.push('taxonomyCategories');

    if (!filtersToClear.length) return;

    updateFilters((prev) => ({
      ...prev,
      activityTypes: filterSupport.activityTypes ? prev.activityTypes : [],
      traits: filterSupport.traits ? prev.traits : [],
      taxonomyCategories: filterSupport.taxonomyCategories ? prev.taxonomyCategories : [],
    }));

    track('map_filters_pruned', { filters: filtersToClear });
  }, [
    filterSupport,
    loadActivities,
    selectedActivityTypes.length,
    selectedTraits.length,
    selectedTaxonomyCategories.length,
    track,
    updateFilters,
  ]);

  const eventsRangeDays = dataMode === 'events' ? 21 : 14;
  const eventsWindow = useMemo(() => {
    const start = new Date(Date.now() - MAP_EVENTS_LOOKBACK_MS);
    const end = new Date(start.getTime() + eventsRangeDays * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [eventsRangeDays]);

  const eventsQueryBounds = useMemo(() => {
    if (queryCenter) {
      const radiusForEventsQuery = Math.max(radiusMeters, 25_000);
      const aroundCenter = buildBoundsAroundCenter(queryCenter, radiusForEventsQuery);
      return normaliseEventQueryBounds(aroundCenter);
    }
    return bounds ? normaliseEventQueryBounds(bounds) : null;
  }, [bounds, queryCenter, radiusMeters]);

  const eventsQueryArgs = useMemo(
    () =>
      loadEvents && eventsQueryBounds
        ? {
            ...(locationErrored ? {} : { sw: eventsQueryBounds.sw, ne: eventsQueryBounds.ne }),
            from: eventsWindow.from,
            to: eventsWindow.to,
            limit: 200,
          }
        : null,
    [eventsQueryBounds, eventsWindow.from, eventsWindow.to, loadEvents, locationErrored],
  );

  const eventsQuery = useEvents(eventsQueryArgs, {
    fetcher: eventsFetcher,
    enabled: Boolean(eventsQueryArgs) && loadEvents,
    placeholderData: (previous) => previous,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      const message = error?.message?.toLowerCase() ?? '';
      if (message.includes('lat and lng') || message.includes('required') || message.includes('not defined')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const events = useMemo(() => sortEventsByStart(eventsQuery.data?.events ?? []), [eventsQuery.data?.events]);

  const filteredActivities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasSearch = term.length > 0;
    const searchPhrases = extractSearchPhrases(term);
    const searchTokens = extractActivitySearchTokens(term);
    const structuredSearchTokens = extractStructuredActivityTokens(term);
    const normalizeSet = (values?: (string | null | undefined)[] | null) => {
      const set = new Set<string>();
      (values ?? []).forEach((value) => {
        if (typeof value !== 'string') return;
        const trimmed = value.trim().toLowerCase();
        if (trimmed) set.add(trimmed);
      });
      return set;
    };

    const selectedTypes = selectedActivityTypes
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const selectedTraitsList = selectedTraits.map((value) => value.trim().toLowerCase()).filter(Boolean);
    const selectedTaxonomies = selectedTaxonomyCategories
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const filterActivityTypes = selectedTypes.length > 0 && (activityTypesSupported || tagsSupported);
    const filterTraits = selectedTraitsList.length > 0 && traitsSupported;
    const filterTaxonomy = selectedTaxonomies.length > 0 && taxonomyCategoriesSupported;
    const hasAnyStructuredFilter =
      filterActivityTypes
      || filterTraits
      || filterTaxonomy;

    const applyFilters = (activity: MapActivity): boolean => {
      if (filterActivityTypes) {
        const haystack = useTagsForActivityTypes || (!activityTypesSupported && tagsSupported)
          ? normalizeSet(activity.tags)
          : normalizeSet(activity.activity_types);
        if (!selectedTypes.some((value) => haystack.has(value))) return false;
      }

      if (filterTraits) {
        const traits = normalizeSet(activity.traits);
        if (!selectedTraitsList.some((value) => traits.has(value))) return false;
      }

      if (filterTaxonomy) {
        const categories = normalizeSet(activity.taxonomy_categories);
        if (!selectedTaxonomies.some((value) => categories.has(value))) return false;
      }

      if (hasSearch) {
        const intentTokens = new Set<string>([
          ...searchTokens.map((value) => value.trim().toLowerCase()).filter(Boolean),
          ...structuredSearchTokens.map((value) => value.trim().toLowerCase()).filter(Boolean),
          ...selectedTypes,
        ]);
        if (
          isGenericActivityDisplay(activity, PLACE_FALLBACK_LABEL)
          && intentTokens.size > 0
          && !hasTypeIntentMatch(activity, intentTokens)
        ) {
          return false;
        }
        return matchesActivitySearch(activity, {
          term,
          searchPhrases,
          searchTokens,
          structuredSearchTokens,
        });
      }

      return true;
    };

    const baseEffectiveRadiusMeters = hasSearch ? Math.max(radiusMeters, 25_000) : radiusMeters;
    const expandedEffectiveRadiusMeters = Math.max(baseEffectiveRadiusMeters, 25_000);

    const proximityConstrained = activities.filter((activity) =>
      isWithinRadius(queryCenter, baseEffectiveRadiusMeters, activity.lat, activity.lng, activity.distance_m),
    );

    if (
      !hasSearch &&
      !hasAnyStructuredFilter
    ) {
      return dedupeNearDuplicateActivities(proximityConstrained);
    }

    const strictResults = proximityConstrained.filter(applyFilters);
    const shouldExpandSparseFilters =
      !hasSearch
      && hasAnyStructuredFilter
      && strictResults.length < MAP_SPARSE_RESULTS_THRESHOLD
      && expandedEffectiveRadiusMeters > baseEffectiveRadiusMeters;

    if (!shouldExpandSparseFilters) {
      return dedupeNearDuplicateActivities(pruneLowQualitySearchActivities({
        activities: strictResults,
        hasSearch,
        hasStructuredFilters: hasAnyStructuredFilter,
        searchTokens,
        structuredSearchTokens,
        selectedTypes,
        fallbackLabel: PLACE_FALLBACK_LABEL,
      }));
    }

    const expandedProximity = activities.filter((activity) =>
      isWithinRadius(queryCenter, expandedEffectiveRadiusMeters, activity.lat, activity.lng, activity.distance_m),
    );
    return dedupeNearDuplicateActivities(pruneLowQualitySearchActivities({
      activities: expandedProximity.filter(applyFilters),
      hasSearch,
      hasStructuredFilters: hasAnyStructuredFilter,
      searchTokens,
      structuredSearchTokens,
      selectedTypes,
      fallbackLabel: PLACE_FALLBACK_LABEL,
    }));
  }, [
    activities,
    queryCenter,
    radiusMeters,
    searchTerm,
    selectedActivityTypes,
    selectedTraits,
    selectedTaxonomyCategories,
    activityTypesSupported,
    tagsSupported,
    traitsSupported,
    taxonomyCategoriesSupported,
    useTagsForActivityTypes,
  ]);

  const filteredEvents = useMemo(() => {
    const effectiveRadiusMeters = normalizedSearchTerm.length > 0 ? Math.max(radiusMeters, 25_000) : radiusMeters;
    const nearbyEvents = locationErrored
      ? events
      : events.filter((eventSummary) =>
          isWithinRadius(queryCenter, effectiveRadiusMeters, eventSummary.lat, eventSummary.lng, null),
        );
    const scopedEvents = nearbyEvents.length > 0 ? nearbyEvents : events;
    if (!normalizedSearchTerm) return scopedEvents;
    const searchPhrases = extractSearchPhrases(normalizedSearchTerm);
    return scopedEvents.filter((eventSummary) => {
      const title = eventSummary.title?.toLowerCase() ?? '';
      const venue = eventSummary.venue_name?.toLowerCase() ?? '';
      const place = eventSummary.place_label?.toLowerCase() ?? '';
      const haystack = `${title} ${venue} ${place}`;
      return haystack.includes(normalizedSearchTerm) || searchPhrases.some((searchWord) => haystack.includes(searchWord));
    });
  }, [events, locationErrored, queryCenter, radiusMeters, normalizedSearchTerm]);

  useEffect(() => {
    if (!effectiveHighlightSessionId) return;

    const match = filteredEvents.find((eventSummary) => {
      if (eventSummary.id === effectiveHighlightSessionId) return true;
      const sessionId = getEventSessionId(eventSummary);
      return sessionId === effectiveHighlightSessionId;
    });
    if (match) {
      setSelectedEventId(match.id);
      setSelectedActivityId(null);
      if (dataMode === 'activities') {
        setDataMode('both');
      }
      setViewMode('list');
      const params = new URLSearchParams(searchParamsString);
      params.delete('activity');
      const basePath = pathname ?? '/map';
      const nextUrl = params.toString() ? `${basePath}?${params.toString()}` : basePath;
      router.replace(nextUrl as Route, { scroll: false });
      return;
    }

    if (attemptedHighlightFetchRef.current.has(effectiveHighlightSessionId)) return;
    attemptedHighlightFetchRef.current.add(effectiveHighlightSessionId);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(effectiveHighlightSessionId)}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = (await response.json()) as { session?: unknown; error?: string };
        if (!response.ok || !payload?.session) return;
        if (cancelled) return;

        const centerFromSession = resolveMapCenterFromSession(payload.session);
        if (centerFromSession) {
          centerRef.current = centerFromSession;
          queryCenterRef.current = centerFromSession;
          setCenter(centerFromSession);
          setQueryCenter(centerFromSession);
          const delta = 0.02;
          const nextBounds = {
            sw: { lat: centerFromSession.lat - delta, lng: centerFromSession.lng - delta },
            ne: { lat: centerFromSession.lat + delta, lng: centerFromSession.lng + delta },
          };
          boundsRef.current = nextBounds;
          setBounds(nextBounds);
        }

        if (dataMode === 'activities') {
          setDataMode('both');
        }
        setSelectedEventId(effectiveHighlightSessionId);
        setSelectedActivityId(null);
        setViewMode('list');
      } catch {
        // Ignore; normal events query flow will continue and the param stays for the next refresh.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataMode, effectiveHighlightSessionId, filteredEvents, pathname, router, searchParamsString]);

  useEffect(() => {
    if (effectiveHighlightSessionId) {
      pendingActivityParamSyncRef.current = null;
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    const requestedId = params.get('activity');
    const syncResolution = resolveFocusedActivitySync({
      requestedId,
      pendingEncodedId: pendingActivityParamSyncRef.current,
    });
    if (syncResolution.defer) {
      return;
    }
    if (syncResolution.shouldClearPending) {
      pendingActivityParamSyncRef.current = null;
    }
    lastSyncedActivityIdRef.current = requestedId;
    if (!requestedId) {
      if (selectedActivityId) {
        setSelectedActivityId(null);
      }
      return;
    }
    if (requestedId === selectedActivityId) return;
    setSelectedActivityId(requestedId);
    setSelectedEventId(null);
    setViewMode('list');
  }, [effectiveHighlightSessionId, searchParamsString, selectedActivityId]);

  const availableActivityTypes = useMemo(() => {
    if (useTagsForActivityTypes && facetTags.length) {
      return facetTags.map((entry) => entry.value);
    }
    if (activityTypesSupported && facetActivityTypes.length) {
      return facetActivityTypes.map((entry) => entry.value);
    }
    if (!activityTypesSupported && tagsSupported && facetTags.length) {
      return facetTags.map((entry) => entry.value);
    }
    const set = new Set<string>();
    if (activityTypesSupported) {
      for (const activity of activities) {
        for (const type of activity.activity_types ?? []) {
          if (typeof type === "string" && type.trim()) set.add(type.trim());
        }
      }
    }
    if (!set.size && tagsSupported) {
      for (const activity of activities) {
        for (const tag of activity.tags ?? []) {
          if (typeof tag === "string" && tag.trim()) set.add(tag.trim());
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities, activityTypesSupported, facetActivityTypes, facetTags, tagsSupported, useTagsForActivityTypes]);
  const activityTypeOptions = useMemo(
    () => mergeStringFilterOptions(availableActivityTypes, selectedActivityTypes),
    [availableActivityTypes, selectedActivityTypes],
  );

  const availableTraits = useMemo(() => {
    if (!traitsSupported) return [];
    if (facetTraits.length) {
      return facetTraits.map((entry) => entry.value);
    }
    const set = new Set<string>();
    for (const activity of activities) {
      for (const trait of activity.traits ?? []) {
        if (typeof trait === "string" && trait.trim()) set.add(trait.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities, facetTraits, traitsSupported]);
  const traitOptions = useMemo(
    () => mergeStringFilterOptions(availableTraits, selectedTraits),
    [availableTraits, selectedTraits],
  );

  const availableTaxonomyCategories = useMemo(() => {
    if (!taxonomyCategoriesSupported) return [];
    if (facetTaxonomyCategories.length) {
      return facetTaxonomyCategories.map((entry) => entry.value);
    }
    const set = new Set<string>();
    for (const activity of activities) {
      for (const category of activity.taxonomy_categories ?? []) {
        if (typeof category === 'string' && category.trim()) set.add(category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities, facetTaxonomyCategories, taxonomyCategoriesSupported]);
  const taxonomyOptions = useMemo(
    () => mergeStringFilterOptions(availableTaxonomyCategories, selectedTaxonomyCategories),
    [availableTaxonomyCategories, selectedTaxonomyCategories],
  );

  const taxonomyFacetCounts = useMemo(() => {
    const map = new Map<string, number>();
    facetTaxonomyCategories.forEach((entry) => {
      if (entry.value) {
        map.set(entry.value, entry.count);
      }
    });
    return map;
  }, [facetTaxonomyCategories]);

  const showActivityTypeFilter = loadActivities && (activityTypesSupported || tagsSupported) && activityTypeOptions.length > 0;
  const showPeopleTraitsFilter = loadActivities && traitsSupported && traitOptions.length > 0;
  const showTaxonomyFilter = loadActivities && taxonomyCategoriesSupported && taxonomyOptions.length > 0;
  const showActivityFocusFilter = loadActivities && (showActivityTypeFilter || showTaxonomyFilter);

  const toggleActivityType = useCallback(
    (value: string) => {
      setSelectedActivityTypes((prev) => {
        const active = prev.includes(value);
        const next = active ? prev.filter((v) => v !== value) : [...prev, value];
        track('map_filter_activity', { value, active: !active });
        return next;
      });
    },
    [setSelectedActivityTypes, track],
  );

  const toggleTrait = useCallback(
    (value: string) => {
      setSelectedTraits((prev) => {
        const active = prev.includes(value);
        const next = active ? prev.filter((v) => v !== value) : [...prev, value];
        track('map_filter_trait', { value, active: !active });
        return next;
      });
    },
    [setSelectedTraits, track],
  );

  const toggleTaxonomyCategory = useCallback(
    (value: string) => {
      setSelectedTaxonomyCategories((prev) => {
        const active = prev.includes(value);
        const next = active ? prev.filter((entry) => entry !== value) : [...prev, value];
        track('map_filter_taxonomy', { value, active: !active });
        return next;
      });
    },
    [setSelectedTaxonomyCategories, track],
  );

  const resetFilters = () => {
    track('map_filters_reset', {
      activityTypes: selectedActivityTypes.length,
      traits: selectedTraits.length,
      taxonomyCategories: selectedTaxonomyCategories.length,
      trustMode: selectedTrustMode,
    });
    setSearchTerm('');
    updateFilters(() => sanitizeVisibleMapFilters(DEFAULT_MAP_FILTER_PREFERENCES));
  };

  const changeViewMode = useCallback(
    (mode: ToggleOption) => {
      setViewMode(mode);
      track('map_toggle_view', { view: mode });
    },
    [track],
  );

  const applyMoveEnd = useCallback(
    ({ center: nextCenter, radiusMeters: nextRadius, bounds: nextBounds, zoom: nextZoom }: MovePayload) => {
      const prevCenter = centerRef.current;
      const prevQueryCenter = queryCenterRef.current;
      const prevRadius = radiusRef.current;
      const prevBounds = boundsRef.current;

      const normalizedCenter: MapCoordinates = {
        lat: roundCoordinate(nextCenter.lat, 6),
        lng: roundCoordinate(nextCenter.lng, 6),
      };
      const normalizedRadius = normaliseRadiusMeters(nextRadius);
      const normalizedBounds = normaliseBounds(nextBounds);

      const centerChanged =
        !prevCenter ||
        Math.abs(prevCenter.lat - normalizedCenter.lat) > CENTER_UPDATE_THRESHOLD ||
        Math.abs(prevCenter.lng - normalizedCenter.lng) > CENTER_UPDATE_THRESHOLD;
      const queryCenterChanged =
        !prevQueryCenter ||
        Math.abs(prevQueryCenter.lat - normalizedCenter.lat) > CENTER_UPDATE_THRESHOLD ||
        Math.abs(prevQueryCenter.lng - normalizedCenter.lng) > CENTER_UPDATE_THRESHOLD;
      const radiusChanged = normalizedRadius !== prevRadius;
      const boundsChanged = !boundsEqual(prevBounds, normalizedBounds);

      if (centerChanged) {
        centerRef.current = normalizedCenter;
        setCenter(normalizedCenter);
      }
      if (queryCenterChanged) {
        queryCenterRef.current = normalizedCenter;
        setQueryCenter(normalizedCenter);
      }
      if (radiusChanged) {
        radiusRef.current = normalizedRadius;
        setRadiusMeters(normalizedRadius);
      }
      if (boundsChanged) {
        boundsRef.current = normalizedBounds;
        setBounds(normalizedBounds);
      }

      if (centerChanged || radiusChanged) {
        track('map_region_change', {
          lat: Number(normalizedCenter.lat.toFixed(5)),
          lng: Number(normalizedCenter.lng.toFixed(5)),
          radiusMeters: normalizedRadius,
          zoom: nextZoom,
          dataMode: dataModeRef.current,
        });
      }
    },
    [track],
  );

  const { debounced: scheduleMoveEnd } = useDebouncedCallback(applyMoveEnd, MOVE_END_DEBOUNCE_MS);

  const handleMoveEnd = useCallback(
    (payload: MovePayload) => {
      scheduleMoveEnd(payload);
    },
    [scheduleMoveEnd],
  );

  const handleActivitySelect = useCallback(
    (activity: MapActivity) => {
      setSelectedActivityId(activity.id);
      setSelectedEventId(null);
      track('map_activity_focus', { activityId: activity.id, source: 'map' });
      syncFocusedActivityParam(activity.id, 'push');
    },
    [syncFocusedActivityParam, track],
  );

  const handleEventSelect = useCallback(
    (eventSummary: EventSummary) => {
      setSelectedEventId(eventSummary.id);
      setSelectedActivityId(null);
      track('map_event_focus', { eventId: eventSummary.id, source: 'map' });
      syncFocusedActivityParam(null, 'push');
    },
    [syncFocusedActivityParam, track],
  );

  const handleFocusActivity = useCallback(
    (activity: MapActivity) => {
      if (!activity.lat || !activity.lng) return;
      setSelectedActivityId(activity.id);
      setSelectedEventId(null);
      track('map_activity_focus', { activityId: activity.id, source: 'list' });
      changeViewMode('map');
      syncFocusedActivityParam(activity.id, 'push');
    },
    [changeViewMode, syncFocusedActivityParam, track],
  );

  const handleFocusEvent = useCallback(
    (eventSummary: EventSummary) => {
      if (eventSummary.lat != null && eventSummary.lng != null) {
        setCenter({ lat: eventSummary.lat, lng: eventSummary.lng });
      }
      setSelectedEventId(eventSummary.id);
      setSelectedActivityId(null);
      track('map_event_focus', { eventId: eventSummary.id, source: 'list' });
      changeViewMode('map');
      syncFocusedActivityParam(null, 'push');
    },
    [changeViewMode, syncFocusedActivityParam, track],
  );

  const handleViewEvents = useCallback(
    (activityId: string) => {
      const target = `/activities/${activityId}`;
      track('map_activity_events_requested', {
        activityId,
        authenticated: isAuthenticated === true,
      });
      if (isAuthenticated) {
        router.push(target as Route);
      } else {
        router.push(`/auth?redirect=${encodeURIComponent(target)}` as Route);
      }
    },
    [isAuthenticated, router, track],
  );

  const handleCreateEvent = useCallback(
    (activity: MapActivity) => {
      const params = new URLSearchParams();
      if (isUuid(activity.id)) {
        params.set('activityId', activity.id);
      }
      if (activity.name) params.set('activityName', activity.name);
      const placeLabel = activityPlaceLabel(activity);
      if (placeLabel) params.set('venueName', placeLabel);
      if (activity.place_id && isUuid(activity.place_id)) {
        params.set('placeId', activity.place_id);
      }
      if (typeof activity.lat === 'number') params.set('lat', activity.lat.toFixed(6));
      if (typeof activity.lng === 'number') params.set('lng', activity.lng.toFixed(6));
      const target = `/create?${params.toString()}`;
      track('map_activity_create_event', {
        activityId: activity.id,
        authenticated: isAuthenticated === true,
      });
      if (isAuthenticated) {
        router.push(target as Route);
      } else {
        router.push(`/auth?redirect=${encodeURIComponent(target)}` as Route);
      }
    },
    [isAuthenticated, router, track],
  );

const handleRequestDetails = useCallback(
  (activity: MapActivity) => {
    handleViewEvents(activity.id);
  },
  [handleViewEvents],
);

const handleEventDetails = useCallback((eventSummary: EventSummary) => {
  track('map_event_details_requested', {
    eventId: eventSummary.id,
    hasUrl: Boolean(eventSummary.url),
  });

  const sessionId = getEventSessionId(eventSummary);
  if (sessionId) {
    router.push(`/sessions/${sessionId}` as Route);
    return;
  }

  const internalUrl = typeof eventSummary.url === 'string' && eventSummary.url.startsWith('/')
    ? (eventSummary.url as Route)
    : null;
  if (internalUrl) {
    router.push(internalUrl);
    return;
  }

  if (eventSummary.id) {
    router.push(`/events/${eventSummary.id}` as Route);
    return;
  }

  if (eventSummary.url) {
    window.open(eventSummary.url, '_blank', 'noopener,noreferrer');
  }
}, [router, track]);

  const changeDataMode = useCallback(
    (mode: 'activities' | 'events' | 'both') => {
      setDataMode(mode);
      track('map_toggle_data', { mode });
    },
    [track],
  );

  const hasSearchFilter = searchTerm.trim().length > 0;
  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (hasSearchFilter) {
      const term = searchTerm.trim();
      chips.push({
        key: 'search',
        label: `Search “${term}”`,
        onRemove: () => setSearchTerm(''),
      });
    }
    selectedActivityTypes.forEach((type) => {
      chips.push({
        key: `type:${type}`,
        label: type,
        onRemove: () => toggleActivityType(type),
      });
    });
    selectedTraits.forEach((trait) => {
      chips.push({
        key: `trait:${trait}`,
        label: trait,
        onRemove: () => toggleTrait(trait),
      });
    });
    selectedTaxonomyCategories.forEach((category) => {
      chips.push({
        key: `taxonomy:${category}`,
        label: formatTaxonomyLabel(category),
        onRemove: () => toggleTaxonomyCategory(category),
      });
    });
    if (selectedTrustMode !== 'all') {
      const option = TRUST_OPTION_BY_KEY.get(selectedTrustMode);
      chips.push({
        key: `trust:${selectedTrustMode}`,
        label: option?.label ?? selectedTrustMode,
        onRemove: () => setTrustMode('all'),
      });
    }
    return chips;
  }, [
    hasSearchFilter,
    searchTerm,
    selectedActivityTypes,
    selectedTraits,
    selectedTaxonomyCategories,
    selectedTrustMode,
    setSearchTerm,
    toggleActivityType,
    toggleTrait,
    toggleTaxonomyCategory,
    setTrustMode,
  ]);

  const activeFiltersCount = activeFilterChips.length;

  const handleRefreshSearch = useCallback(async () => {
    if (!query) return;
    setIsRefreshing(true);
    track('map_refresh_search', {
      radiusMeters,
      filtersApplied: activeFiltersCount,
      dataMode,
    });
    try {
      const refreshed = await fetcher({ ...query, refresh: true });
      queryClient.setQueryData(mapActivitiesQueryKey(query), refreshed);
      if (loadEvents) {
        void eventsQuery.refetch();
      }
      showToast('Search updated', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh search';
      showToast(message, 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [
    query,
    radiusMeters,
    activeFiltersCount,
    dataMode,
    fetcher,
    queryClient,
    showToast,
    track,
    loadEvents,
    eventsQuery,
  ]);

  const handleWidenRadius = useCallback(() => {
    const nextRadius = Math.min(radiusMeters * 2, 50_000);
    setRadiusMeters(nextRadius);
    track('map_widen_radius', { from: radiusMeters, to: nextRadius });
    showToast(`Radius widened to ~${formatKilometres(nextRadius)}`, 'info');
  }, [radiusMeters, setRadiusMeters, showToast, track]);

  const handleCreateFromCenter = useCallback(() => {
    const params = new URLSearchParams();
    if (queryCenter?.lat != null) params.set('lat', queryCenter.lat.toFixed(6));
    if (queryCenter?.lng != null) params.set('lng', queryCenter.lng.toFixed(6));
    const target = `/create?${params.toString()}`;
    router.push(target as Route);
  }, [queryCenter, router]);

  useEffect(() => {
    if (!nearby.data) return;
    track('map_view', {
      activityCount: nearby.data.activities.length,
      radiusMeters: nearby.data.radiusMeters,
      filtersApplied: activeFiltersCount,
      source: nearby.data.source ?? 'unknown',
    });
  }, [nearby.data, activeFiltersCount, track]);

  useEffect(() => {
    if (!eventsQuery.data || !loadEvents) return;
    track('map_events_view', {
      eventCount: eventsQuery.data.events.length,
      radiusMeters,
    });
  }, [eventsQuery.data, loadEvents, radiusMeters, track]);

  useEffect(() => {
    if (dataMode === 'events') {
      setSelectedActivityId(null);
      syncFocusedActivityParam(null, 'replace');
    }
    if (dataMode === 'activities') {
      setSelectedEventId(null);
    }
  }, [dataMode, syncFocusedActivityParam]);

  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      const trustA = a.trust_score ?? -1;
      const trustB = b.trust_score ?? -1;
      if (trustA !== trustB) return trustB - trustA;
      const rankA = a.rank_score ?? -1;
      const rankB = b.rank_score ?? -1;
      if (rankA !== rankB) return rankB - rankA;
      return (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY);
    });
  }, [filteredActivities]);

  const selectedActivity = useMemo(() => {
    if (!selectedActivityId) return null;
    return activities.find((activity) => activity.id === selectedActivityId) ?? null;
  }, [activities, selectedActivityId]);

  useEffect(() => {
    if (!selectedActivity) {
      centeredForActivityIdRef.current = null;
      return;
    }
    if (centeredForActivityIdRef.current === selectedActivity.id) return;
    if (!Number.isFinite(selectedActivity.lat) || !Number.isFinite(selectedActivity.lng)) return;

    const nextCenter = { lat: Number(selectedActivity.lat.toFixed(6)), lng: Number(selectedActivity.lng.toFixed(6)) };
    centerRef.current = nextCenter;
    queryCenterRef.current = nextCenter;
    setCenter(nextCenter);
    setQueryCenter(nextCenter);

    const nextBounds = buildBoundsAroundCenter(nextCenter, Math.max(radiusMeters, 25_000));
    boundsRef.current = nextBounds;
    setBounds(nextBounds);

    centeredForActivityIdRef.current = selectedActivity.id;
  }, [radiusMeters, selectedActivity]);

  const selectedActivitySummary = useMemo(() => {
    if (!selectedActivity) return null;
    const place = activityPlaceLabel(selectedActivity) ?? PLACE_FALLBACK_LABEL;
    const types = (selectedActivity.activity_types ?? [])
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
    const traitsList = (selectedActivity.traits ?? [])
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
    const taxonomy = (selectedActivity.taxonomy_categories ?? [])
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
    const chips = buildActivityMetadataChips(selectedActivity);
    return {
      id: selectedActivity.id,
      name: selectedActivity.name ?? 'Activity',
      place,
      website: selectedActivity.website ?? null,
      types: types.slice(0, 3),
      traits: traitsList.slice(0, 3),
      taxonomy: taxonomy.slice(0, 3),
      chips,
      upcomingSessions: selectedActivity.upcoming_session_count ?? 0,
      source: selectedActivity.source ?? null,
      trustScore: selectedActivity.trust_score ?? null,
      verificationLabel: activityVerificationLabel(selectedActivity),
      verificationClass: activityVerificationClass(selectedActivity),
    };
  }, [selectedActivity]);

  const focusedActivityId = selectedActivitySummary?.id ?? null;

  const handleCopyFocusedActivityLink = useCallback(async () => {
    if (!focusedActivityId) return;
    if (typeof window === 'undefined') return;
    const href = window.location.href;
    if (!href) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = href;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedActivityLink(true);
      track('map_activity_link_copied', { activityId: focusedActivityId });
      showToast('Link copied to clipboard');
    } catch (error) {
      console.warn('[map] failed to copy focused activity link', error);
      showToast('Unable to copy link', 'error');
    }
  }, [focusedActivityId, showToast, track]);

  const clearSelectedActivity = useCallback(() => {
    setSelectedActivityId(null);
    syncFocusedActivityParam(null, 'push');
  }, [setSelectedActivityId, syncFocusedActivityParam]);

  const radiusLabel = formatKilometres(radiusMeters);
  const headerTitle = dataMode === 'events' ? 'Nearby sessions & events' : dataMode === 'both' ? 'Activities · sessions & events nearby' : 'Nearby activities';
  const filteredActivitiesCount = filteredActivities.length;
  const filteredEventsCount = filteredEvents.length;
  const headerSummary = dataMode === 'events'
    ? `Showing ${filteredEventsCount} sessions/events in ~${radiusLabel} radius`
    : dataMode === 'both'
      ? `${filteredActivitiesCount} activities · ${filteredEventsCount} sessions/events in ~${radiusLabel} radius`
      : `Showing ${filteredActivitiesCount} activities in ~${radiusLabel} radius`;

  const eventTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  );

  const isBothView = dataMode === 'both';
  const listPanelWidthClass = isBothView ? 'lg:w-[640px]' : 'lg:w-[420px]';
  const listSectionsClass = isBothView
    ? 'flex-1 overflow-y-auto px-4 py-4 space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0'
    : 'flex-1 overflow-y-auto px-4 py-4 space-y-6';
  const listSectionCardClass = isBothView ? 'soft-card px-sm py-sm lg:px-md lg:py-md' : '';

  const mapActivities = loadActivities ? filteredActivities : EMPTY_ACTIVITIES;
  const mapEvents = loadEvents ? filteredEvents : EMPTY_EVENTS;
  const radiusExpansion = nearbyData?.radiusExpansion ?? null;
  const mapLoading = (loadActivities && stableNearby.isInitialLoading) || (loadEvents && eventsQuery.isLoading);
  const refreshDisabled = !query || isRefreshing || stableNearby.isRefreshing;
  const filtersButtonDisabled = !loadActivities && !loadEvents;

  const activityListEmpty = loadActivities && !stableNearby.isInitialLoading && filteredActivities.length === 0;
  const eventListEmpty = loadEvents && !eventsQuery.isLoading && filteredEvents.length === 0;
  const activityEmptyCopy = hasSearchFilter
    ? `No activities match "${searchTerm}". Try another name or clear the search.`
    : selectedTrustMode === 'verified_only'
      ? 'No confirmed activities match here yet. Try showing all results or widening the map.'
      : selectedTrustMode === 'ai_only'
        ? 'No suggestion-first activities match here yet. Try showing all results or widening the map.'
        : "No activities match those filters yet. Try widening your search.";
  const eventEmptyCopy = hasSearchFilter
    ? `No sessions or events match "${searchTerm}". Try another name or clear the search.`
    : selectedTrustMode === 'verified_only'
      ? 'No confirmed sessions or events match here yet. Try showing all results or widening the map.'
      : selectedTrustMode === 'ai_only'
        ? 'No suggestion-first sessions or events match here yet. Try showing all results or widening the map.'
        : "No sessions or events match those filters yet. Try widening your search.";

  if (!e2eBypassAuth && (coreAccessState !== 'allowed' || isAuthenticated !== true)) {
    return (
      <div className="flex h-[calc(100dvh-64px)] items-center justify-center text-sm text-ink-muted">
        Redirecting to your access checkpoint…
      </div>
    );
  }

  if (!center) {
    return (
      <div className="flex h-[calc(100dvh-64px)] items-center justify-center text-sm text-ink-muted">
        {locationErrored ? "Location unavailable. Using default city…" : "Locating you…"}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col bg-surface-canvas/80">
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-white/40 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-xs">
          <button
            type="button"
            onClick={() => changeViewMode("map")}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${viewMode === "map" ? "bg-brand-teal text-white shadow-sm" : "bg-white/80 text-ink-strong hover:bg-white"} lg:hidden`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${viewMode === "list" ? "bg-brand-teal text-white shadow-sm" : "bg-white/80 text-ink-strong hover:bg-white"} lg:hidden`}
          >
            List
          </button>
          <div className="hidden text-sm font-semibold text-ink-strong lg:block">{headerTitle}</div>
          <div className="flex items-center gap-xs">
            {(['activities', 'events', 'both'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeDataMode(mode)}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                    dataMode === mode ? 'bg-brand-teal text-white shadow-sm' : 'bg-white/80 text-ink-strong hover:bg-white'
                }`}
              >
                {mode === 'activities' ? 'Activities' : mode === 'events' ? 'Schedules' : 'Both'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <div className="hidden text-xs text-ink-muted lg:block">{headerSummary}</div>
          <button
            type="button"
            onClick={handleRefreshSearch}
            disabled={refreshDisabled}
            className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/40 px-sm py-xxs text-sm font-medium text-ink hover:border-brand-teal/60 hover:text-brand-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh search'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (filtersButtonDisabled) return;
              setFiltersOpen(true);
              track('map_filters_opened');
            }}
            disabled={filtersButtonDisabled}
            className="inline-flex items-center gap-xs rounded-full border border-brand-teal px-sm py-xxs text-sm font-medium text-brand-teal hover:bg-brand-teal/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Filters
            {activeFiltersCount > 0 && (
              <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-brand-teal px-xxs text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-xs border-b border-midnight-border/30 bg-surface px-md py-xxs text-[11px] text-ink-muted">
          <span className="font-semibold uppercase tracking-wide text-ink">Active filters</span>
          <div className="flex flex-wrap gap-xs">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/40 bg-surface-alt px-xs py-hairline text-[11px] font-medium text-ink hover:border-brand-teal/60 hover:text-brand-teal"
              >
                <span>{chip.label}</span>
                <span aria-hidden className="text-xs">×</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-brand-teal hover:text-brand-dark"
          >
            Clear all
          </button>
        </div>
      )}
      {radiusExpansion && (
        <div className="border-b border-sky-200 bg-sky-50 px-md py-sm text-xs text-sky-900">
          <p className="font-semibold text-sky-800">Search radius auto-expanded</p>
          <p className="mt-hairline">{radiusExpansion.note}</p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`${viewMode === "map" ? "flex" : "hidden"} h-[50vh] min-h-[320px] flex-1 bg-surface-alt lg:flex lg:h-auto`}
        >
          <WebMap
            center={center}
            activities={mapActivities}
            events={mapEvents}
            radiusMeters={radiusMeters}
            isLoading={mapLoading}
            mode={dataMode}
            onMoveEnd={handleMoveEnd}
            onSelectActivity={handleActivitySelect}
            onSelectEvent={handleEventSelect}
            onRequestDetails={handleRequestDetails}
            onRequestCreateEvent={handleCreateEvent}
            onRequestEventDetails={handleEventDetails}
            activeActivityId={selectedActivityId}
            activeEventId={selectedEventId}
          />
        </div>
        <aside
          className={`${viewMode === "list" ? "flex" : "hidden"} h-[50vh] min-h-[320px] flex-col border-t border-midnight-border/40 bg-surface lg:flex lg:h-auto ${listPanelWidthClass} lg:border-l`}
        >
          <div className="flex items-center justify-between border-b border-midnight-border/40 px-md py-sm text-xs text-ink-muted">
            <span>
              {dataMode === 'events'
                ? `${filteredEventsCount} events`
                : dataMode === 'both'
                  ? `${filteredActivitiesCount} activities · ${filteredEventsCount} events`
                  : `${sortedActivities.length} activities`}
            </span>
            <span>Radius ~{radiusLabel}</span>
          </div>
          {selectedActivitySummary && loadActivities && (
            <div className="border-b border-midnight-border/40 px-md py-sm text-[11px] text-ink-muted">
              <div className="flex items-start justify-between gap-sm">
                <div className="flex items-start gap-sm">
                  <PlaceBrandMark
                    name={selectedActivitySummary.place}
                    website={selectedActivitySummary.website}
                    size="sm"
                    className="shrink-0"
                  />
                  <div>
                    <div className="font-semibold uppercase tracking-wide text-brand-teal">Focused activity</div>
                    <div className="text-sm font-semibold text-ink">{selectedActivitySummary.name}</div>
                    <div className="mt-hairline flex items-center gap-xxs">
                      <span aria-hidden>📍</span>
                      <span>{selectedActivitySummary.place}</span>
                    </div>
                    <div className="mt-xxs flex flex-wrap items-center gap-xxs text-[10px] font-semibold uppercase tracking-wide">
                      <span className={`rounded-full border px-xs py-hairline ${selectedActivitySummary.verificationClass}`}>
                        {selectedActivitySummary.verificationLabel}
                      </span>
                      <span className="rounded-full border border-midnight-border/30 bg-surface-alt px-xs py-hairline text-ink-muted">
                        Trust {formatTrustPercent(selectedActivitySummary.trustScore)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-xxs text-right">
                  {selectedActivitySummary.source ? (
                    <span className="rounded-full bg-surface-alt px-xs py-hairline text-[10px] uppercase tracking-wide text-ink-muted">
                      {selectedActivitySummary.source}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-end gap-xxs">
                    <button
                      type="button"
                      onClick={handleCopyFocusedActivityLink}
                      disabled={!focusedActivityId}
                      className="rounded-full border border-midnight-border/40 px-xs py-hairline text-[10px] font-semibold uppercase tracking-wide text-ink-muted hover:border-brand-teal/60 hover:text-brand-teal disabled:opacity-50"
                    >
                      {copiedActivityLink ? 'Copied!' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedActivity}
                      className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted hover:text-brand-teal"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              {selectedActivitySummary.chips.length > 0 && (
                <div className="mt-xs flex flex-wrap gap-xxs text-[11px] text-ink">
                  {selectedActivitySummary.chips.map((chip) => (
                    <span
                      key={`summary-${chip.key}`}
                      className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/30 bg-surface-alt px-xs py-hairline"
                    >
                      {chip.icon ? <span aria-hidden>{chip.icon}</span> : null}
                      <span>{chip.label}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-xs grid gap-xxs text-[11px] text-ink">
                {selectedActivitySummary.types.length ? (
                  <div>
                    <span className="font-semibold text-ink-strong">Types:</span> {selectedActivitySummary.types.join(', ')}
                  </div>
                ) : null}
                {selectedActivitySummary.traits.length ? (
                  <div>
                    <span className="font-semibold text-ink-strong">Traits:</span> {selectedActivitySummary.traits.join(', ')}
                  </div>
                ) : null}
                {selectedActivitySummary.taxonomy.length ? (
                  <div>
                    <span className="font-semibold text-ink-strong">Taxonomy:</span> {selectedActivitySummary.taxonomy.map((value) => formatTaxonomyLabel(value)).join(', ')}
                  </div>
                ) : null}
                <div>
                  <span className="font-semibold text-ink-strong">Upcoming sessions:</span> {selectedActivitySummary.upcomingSessions}
                </div>
              </div>
            </div>
          )}
          <div className={listSectionsClass}>
            {loadActivities && (
              <section className={listSectionCardClass} aria-label="Activities list">
                <header className="mb-sm flex items-start gap-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-teal/10 text-lg">🏃‍♀️</span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Activities</h3>
                    <p className="text-xs text-ink-muted">Recurring sessions hosted on doWhat.</p>
                  </div>
                </header>
                {stableNearby.isInitialLoading && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-medium">
                    Loading nearby activities…
                  </div>
                )}
                {stableNearby.isRefreshing && !stableNearby.isInitialLoading && (
                  <div className="rounded-lg border border-midnight-border/30 bg-surface-alt p-xs text-[11px] text-ink-muted">
                    Refreshing results…
                  </div>
                )}
                {nearby.isError && (
                  <div className="rounded-lg border border-feedback-danger/30 bg-feedback-danger/5 p-md text-sm text-feedback-danger">
                    {(nearby.error?.message ?? "Failed to load activities")}
                  </div>
                )}
                {activityListEmpty && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-muted">
                    <p>{activityEmptyCopy}</p>
                    <div className="mt-xs flex flex-wrap gap-xs">
                      <button
                        type="button"
                        onClick={handleRefreshSearch}
                        className="rounded-full border border-midnight-border/40 bg-white px-sm py-xxs text-[11px] font-semibold text-ink hover:border-brand-teal/60 hover:text-brand-teal"
                      >
                        Refresh search
                      </button>
                      <button
                        type="button"
                        onClick={handleWidenRadius}
                        className="rounded-full border border-brand-teal/40 bg-brand-teal/5 px-sm py-xxs text-[11px] font-semibold text-brand-teal hover:border-brand-teal"
                      >
                        Widen radius
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateFromCenter}
                        className="rounded-full bg-brand-teal px-sm py-xxs text-[11px] font-semibold text-white hover:bg-brand-dark"
                      >
                        Start session here
                      </button>
                    </div>
                  </div>
                )}
                <ul className="flex flex-col gap-sm">
                  {sortedActivities.map((activity) => {
                    const isSelected = activity.id === selectedActivityId;
                    const savePayload = createMapActivitySavePayload(activity);
                    const upcomingSessions = activity.upcoming_session_count ?? 0;
                    const canViewEvents = upcomingSessions > 0;
                    const placeLabel = activityPlaceLabel(activity);
                    const activitySubtitle = placeLabel ?? PLACE_FALLBACK_LABEL;
                    const metadataChips = buildActivityMetadataChips(activity);
                    const verificationLabel = activityVerificationLabel(activity);
                    const verificationClass = activityVerificationClass(activity);
                    return (
                      <li key={activity.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleFocusActivity(activity)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleFocusActivity(activity);
                            }
                          }}
                          className={`cursor-pointer rounded-2xl border px-md py-md transition ${isSelected ? "border-brand-teal bg-brand-teal/10 shadow" : "border-midnight-border/40 bg-surface hover:border-brand-teal/60"}`}
                        >
                          <div className="flex items-start justify-between gap-md">
                            <div className="flex min-w-0 items-start gap-sm">
                              <PlaceBrandMark
                                name={activitySubtitle}
                                website={activity.website ?? null}
                                size="sm"
                                className="shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                                  Activity
                                </div>
                                <div className="mt-xxs flex items-center gap-xxs text-xs text-ink-muted">
                                  <span aria-hidden>📍</span>
                                  <span>{activitySubtitle}</span>
                                </div>
                                <div className="text-base font-semibold text-ink">{activity.name}</div>
                                <div className="mt-xxs flex flex-wrap items-center gap-xxs text-[10px] font-semibold uppercase tracking-wide">
                                  <span className={`rounded-full border px-xs py-hairline ${verificationClass}`}>
                                    {verificationLabel}
                                  </span>
                                  <span className="rounded-full border border-midnight-border/30 bg-surface-alt px-xs py-hairline text-ink-muted">
                                    Trust {formatTrustPercent(activity.trust_score)}
                                  </span>
                                </div>
                                <p className="mt-xxs text-[11px] text-ink-muted">Recurring crew meet-up backed by nearby venues.</p>
                                {activity.activity_types && activity.activity_types.length > 0 && (
                                  <div className="mt-xs flex flex-wrap gap-xxs">
                                    {activity.activity_types.slice(0, 3).map((type) => (
                                      <span
                                        key={type}
                                        className="inline-flex items-center rounded-full bg-brand-teal/15 px-xs py-hairline text-[11px] font-semibold text-brand-teal"
                                      >
                                        {type}
                                      </span>
                                    ))}
                                    {activity.activity_types.length > 3 && (
                                      <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-xs py-hairline text-[11px] text-brand-teal">
                                        +{activity.activity_types.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {metadataChips.length > 0 && (
                                  <div className="mt-xs flex flex-wrap gap-xxs text-[11px] text-ink-muted">
                                    {metadataChips.map((chip) => (
                                      <span
                                        key={chip.key}
                                        className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/30 bg-surface-alt px-xs py-hairline"
                                      >
                                        {chip.icon ? (
                                          <span aria-hidden>{chip.icon}</span>
                                        ) : null}
                                        <span>{chip.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-xs text-right text-xs text-ink-muted">
                              {activity.distance_m != null ? `~${formatKilometres(activity.distance_m)}` : null}
                              {savePayload ? (
                                <div onClick={(event) => event.stopPropagation()}>
                                  <SaveToggleButton payload={savePayload} size="sm" />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-sm flex flex-wrap items-center gap-xs text-xs">
                            {canViewEvents && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleViewEvents(activity.id);
                                }}
                                className="rounded-full border border-brand-teal/40 px-sm py-xxs text-[11px] font-semibold text-brand-teal hover:border-brand-teal hover:bg-brand-teal/5"
                              >
                                View sessions{upcomingSessions > 0 ? ` (${upcomingSessions})` : ''} →
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCreateEvent(activity);
                              }}
                              className="rounded-full bg-brand-teal/90 px-sm py-xxs text-[11px] font-semibold text-surface transition hover:bg-brand-teal"
                            >
                              Create session
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-midnight-border/40 px-sm py-xxs text-[11px] font-medium text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleFocusActivity(activity);
                              }}
                            >
                              Show on map
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {loadEvents && (
              <section className={listSectionCardClass} aria-label="Sessions and events list">
                <header className="mb-sm flex items-start gap-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-feedback-warning/10 text-lg">🎟️</span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sessions &amp; events</h3>
                    <p className="text-xs text-ink-muted">doWhat sessions plus imported happenings around this area.</p>
                  </div>
                </header>
                {eventsQuery.isLoading && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-medium">
                    Loading sessions &amp; events…
                  </div>
                )}
                {eventsQuery.isError && (
                  <div className="rounded-lg border border-feedback-danger/30 bg-feedback-danger/5 p-md text-sm text-feedback-danger">
                    {(eventsQuery.error?.message ?? "Failed to load sessions and events")}
                  </div>
                )}
                {eventListEmpty && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-muted">
                    {eventEmptyCopy}
                  </div>
                )}
                <ul className="flex flex-col gap-sm">
                  {filteredEvents.map((eventSummary) => {
                    const isSelected = eventSummary.id === selectedEventId;
                    const { start, end } = formatEventTimeRange(eventSummary);
                    const placeLabel = eventPlaceLabel(eventSummary);
                    const placeSubtitle = placeLabel ?? PLACE_FALLBACK_LABEL;
                    const eventOrigin = describeEventOrigin(eventSummary);
                    const verificationLabel = describeEventVerification(eventSummary.status);
                    const verificationClass = eventVerificationClass(eventSummary.status);
                    const stateLabel = describeEventState(eventSummary.event_state);
                    const stateClass = eventStateClass(eventSummary.event_state);
                    const reliabilityScore = clampReliabilityScore(eventSummary.reliability_score);
                    const reliabilityLabel = formatReliabilityLabel(reliabilityScore);
                    const reliabilityConfidence = describeReliabilityConfidence(reliabilityScore);
                    const reliabilityClass = reliabilityBarClass(reliabilityScore);
                    const reliabilityWidth = reliabilityScore == null ? 12 : reliabilityScore;
                    const verificationProgress = buildEventVerificationProgress(eventSummary);
                    const verificationProgressClass = verificationProgress?.complete ? 'bg-brand-teal' : 'bg-amber-500';
                    const eventAction = describeEventPrimaryAction(eventSummary);
                    const externalSourceUrl = typeof eventSummary.url === 'string' && /^https?:\/\//i.test(eventSummary.url)
                      ? eventSummary.url
                      : null;
                    return (
                      <li key={eventSummary.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleFocusEvent(eventSummary)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleFocusEvent(eventSummary);
                            }
                          }}
                          className={`cursor-pointer rounded-2xl border px-md py-md transition ${
                            isSelected
                              ? 'border-feedback-warning bg-feedback-warning/10 shadow'
                              : 'border-midnight-border/40 bg-surface hover:border-feedback-warning/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-md">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                                {eventOrigin.label}
                              </div>
                              <div className="mt-xxs flex items-center gap-xxs text-xs text-ink-muted">
                                <span aria-hidden>📍</span>
                                <span>{placeSubtitle}</span>
                              </div>
                              <div className="text-base font-semibold text-ink">{eventSummary.title}</div>
                              <p className="mt-xxs text-[11px] text-ink-muted">{eventOrigin.helper}</p>
                              <div className="mt-xxs text-xs text-ink-muted">
                                {eventTimeFormatter.format(start)}{end ? ` — ${eventTimeFormatter.format(end)}` : ''}
                              </div>
                              <div className="mt-xxs flex flex-wrap gap-xxs text-[11px] font-semibold">
                                <span className={`rounded-full border px-xs py-hairline ${verificationClass}`}>
                                  {verificationLabel}
                                </span>
                                <span className={`rounded-full border px-xs py-hairline ${stateClass}`}>
                                  {stateLabel}
                                </span>
                              </div>
                                {verificationProgress && (
                                  <div className="mt-xxs space-y-xxs">
                                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                                      <span>Community confirmations</span>
                                      <span className="font-semibold text-ink">
                                        {verificationProgress.confirmations}/{verificationProgress.required}
                                      </span>
                                    </div>
                                    <div className="h-1 rounded-full bg-midnight-border/20">
                                      <div
                                        className={`h-full rounded-full ${verificationProgressClass}`}
                                        style={{ width: `${verificationProgress.percent}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              {eventSummary.tags?.length ? (
                                <div className="mt-xs flex flex-wrap gap-xxs text-[10px] uppercase tracking-wide text-feedback-warning">
                                  {eventSummary.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="rounded bg-feedback-warning/20 px-xxs py-hairline">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-sm space-y-xxs">
                                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                                  <span>Reliability</span>
                                  <span className="font-semibold text-ink">{reliabilityLabel}</span>
                                </div>
                                <p className="text-[11px] text-ink-muted">{reliabilityConfidence}</p>
                                <div className="h-1.5 rounded-full bg-midnight-border/20">
                                  <div
                                    className={`h-full rounded-full ${reliabilityClass}`}
                                    style={{ width: `${reliabilityWidth}%` }}
                                  />
                                </div>
                              </div>
                              <div className="mt-sm flex flex-wrap gap-xs text-xs">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleEventDetails(eventSummary);
                                  }}
                                  className="rounded-full border border-feedback-warning/40 px-sm py-xxs text-[11px] font-semibold text-feedback-warning hover:border-feedback-warning hover:bg-feedback-warning/5"
                                >
                                  {eventAction.label}
                                </button>
                                {eventAction.secondaryLabel && externalSourceUrl ? (
                                  <a
                                    href={externalSourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className="rounded-full border border-midnight-border/40 px-sm py-xxs text-[11px] font-medium text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"
                                  >
                                    {eventAction.secondaryLabel}
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-40 flex bg-midnight/40">
          <div className="ml-auto flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-midnight-border/40 px-lg py-md">
              <div>
                <h2 className="text-base font-semibold text-ink">Filters</h2>
                <p className="text-xs text-ink-muted">Search first, focus on activities, and choose how strict the results should be.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(false);
                  track('map_filters_closed', { via: 'header' });
                }}
                className="rounded-full border border-midnight-border/40 px-sm py-xxs text-xs text-ink-medium hover:border-midnight-border/60"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-lg py-md space-y-xl">
              <section className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 px-md py-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Activities &amp; events filters</h3>
                <p className="mt-xxs text-[11px] text-ink-muted">
                  Search and refine what appears on both map pins and list cards.
                </p>
              </section>
              <div>
                <label htmlFor="map-filter-search" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Search by name
                </label>
                <div className="mt-xxs flex items-center gap-xs">
                  <input
                    id="map-filter-search"
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search activities or events"
                    className="w-full rounded-xl border border-midnight-border/40 bg-surface px-sm py-xs text-sm text-ink focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  />
                  {hasSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink-strong"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-xxs text-[11px] text-ink-muted">
                  Matching results update instantly across the map and list.
                </p>
              </div>
              <section className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 px-md py-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Search area</h3>
                <p className="mt-xxs text-[11px] text-ink-muted">
                  The visible map controls where we search. Move or zoom the map to change the area.
                </p>
                <p className="mt-xxs text-[11px] font-medium text-ink">Current area: radius ~{radiusLabel}</p>
              </section>
              <section className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 px-md py-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Result strictness</h3>
                <p className="mt-xxs text-[11px] text-ink-muted">
                  Choose how much proof a place or event needs before it appears here.
                </p>
                <div className="mt-sm grid gap-xs">
                  {TRUST_OPTIONS.map((option) => {
                    const active = selectedTrustMode === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTrustMode(option.key)}
                        className={`rounded-2xl border px-sm py-sm text-left transition ${
                          active
                            ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                            : 'border-midnight-border/40 bg-surface text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-hairline block text-[11px] text-ink-muted">{option.helper}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              {showActivityFocusFilter ? (
                <section className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 px-md py-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Activity focus</h3>
                  <p className="mt-xxs text-[11px] text-ink-muted">
                    Start broad with activity types, then tighten to specific categories only if you need to.
                  </p>
                  {showActivityTypeFilter ? (
                    <div className="mt-sm">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        {activityTypesSupported ? 'Activity types' : 'Activity tags'}
                      </div>
                      <div className="mt-xs flex flex-wrap gap-xs">
                        {activityTypeOptions.map((type) => {
                          const active = selectedActivityTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleActivityType(type)}
                              className={`rounded-full border px-sm py-xxs text-sm ${
                                active ? 'border-brand-teal bg-brand-teal/10 text-brand-teal' : 'border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal'
                              }`}
                            >
                              {type}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {showTaxonomyFilter ? (
                    <div className={showActivityTypeFilter ? 'mt-md' : 'mt-sm'}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Specific categories</div>
                      <div className="mt-xs flex flex-wrap gap-xs">
                        {taxonomyOptions.map((category) => {
                          const active = selectedTaxonomyCategories.includes(category);
                          const count = taxonomyFacetCounts.get(category);
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => toggleTaxonomyCategory(category)}
                              className={`rounded-full border px-sm py-xxs text-sm ${
                                active ? 'border-brand-teal bg-brand-teal/10 text-brand-teal' : 'border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal'
                              }`}
                              title={formatTaxonomyLabel(category)}
                            >
                              <span>{formatTaxonomyLabel(category)}</span>
                              {typeof count === 'number' ? (
                                <span className="ml-xxs text-[10px] text-ink-muted">({count})</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {showPeopleTraitsFilter ? (
                <section className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 px-md py-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">People vibe</h3>
                  <p className="mt-xxs text-[11px] text-ink-muted">
                    Narrow activity crews by the participant traits we can actually filter here.
                  </p>
                  <div className="mt-sm flex flex-wrap gap-xs">
                    {traitOptions.map((trait) => {
                      const active = selectedTraits.includes(trait);
                      return (
                        <button
                          key={trait}
                          type="button"
                          onClick={() => toggleTrait(trait)}
                          className={`rounded-full border px-sm py-xxs text-sm ${
                            active ? 'border-brand-teal bg-brand-teal/10 text-brand-teal' : 'border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal'
                          }`}
                        >
                          {trait}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {!loadActivities ? (
                <div className="rounded-xl border border-midnight-border/30 bg-surface-alt px-md py-sm text-xs text-ink-muted">
                  Activity filters only apply when “Activities” or “Both” is active. Sessions/events still follow the same search text, trust mode, and map area.
                </div>
              ) : null}
            </div>
            <div className="border-t border-midnight-border/40 px-lg py-md text-sm">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-ink-muted hover:text-ink-strong"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiltersOpen(false);
                    track('map_filters_closed', { via: 'apply' });
                  }}
                  className="rounded-full bg-brand-teal px-md py-xs text-sm font-semibold text-ink-contrast hover:bg-brand-dark"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-md">
          <div
            className={`pointer-events-auto inline-flex items-center gap-xs rounded-full px-md py-xs text-sm font-semibold shadow-lg transition ${
              toastMessage.tone === 'error'
                ? 'bg-feedback-danger text-white'
                : toastMessage.tone === 'info'
                  ? 'bg-midnight-border text-ink-strong'
                  : 'bg-brand-teal text-white'
            }`}
          >
            <span>{toastMessage.message}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-xs font-semibold uppercase tracking-wide text-current opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
