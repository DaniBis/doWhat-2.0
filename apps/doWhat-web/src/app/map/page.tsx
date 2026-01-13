type ActivityMetadataChip = { key: string; label: string; icon?: string };
type MapToast = { message: string; tone: 'success' | 'info' | 'error' };
"use client";

import { useQueryClient } from '@tanstack/react-query';
import dynamic from "next/dynamic";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_RADIUS_METERS,
  createEventsFetcher,
  createNearbyActivitiesFetcher,
  formatEventTimeRange,
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
  type TimeWindowKey,
} from "@dowhat/shared";
import SaveToggleButton from "@/components/SaveToggleButton";

import type { MapMovePayload, ViewBounds } from "@/components/WebMap";
import { PLACE_FALLBACK_LABEL, normalizePlaceLabel } from '@/lib/places/labels';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';
import { supabase } from "@/lib/supabase/browser";
import { buildMapActivitySavePayload as createMapActivitySavePayload } from "@/lib/savePayloads";
import {
  clampReliabilityScore,
  describeEventOrigin,
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

const WebMap = dynamic(() => import("@/components/WebMap"), { ssr: false });

const FALLBACK_CENTER: MapCoordinates = { lat: 51.5074, lng: -0.1278 }; // London default
const EMPTY_ACTIVITIES: MapActivity[] = [];
const EMPTY_EVENTS: EventSummary[] = [];
const MAP_FILTERS_LOCAL_KEY = "map_filters:v1";
const MOVE_END_DEBOUNCE_MS = 250;
const CENTER_UPDATE_THRESHOLD = 0.0005;

type CapacityOption = { key: CapacityFilterKey; label: string };
type TimeWindowOption = { key: TimeWindowKey; label: string };

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

const CAPACITY_OPTION_BY_KEY = new Map<CapacityFilterKey, CapacityOption>(
  CAPACITY_OPTIONS.map((option) => [option.key, option]),
);

const TIME_WINDOW_OPTION_BY_KEY = new Map<TimeWindowKey, TimeWindowOption>(
  TIME_WINDOW_OPTIONS.map((option) => [option.key, option]),
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

const readLocalMapFilters = (): MapFilterPreferences | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MAP_FILTERS_LOCAL_KEY);
    if (!raw) return null;
    return normaliseMapFilterPreferences(JSON.parse(raw) as MapFilterPreferences);
  } catch (error) {
    console.warn("[map] unable to parse cached map filters", error);
    return null;
  }
};

const writeLocalMapFilters = (prefs: MapFilterPreferences) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MAP_FILTERS_LOCAL_KEY,
      JSON.stringify(normaliseMapFilterPreferences(prefs)),
    );
  } catch (error) {
    console.warn("[map] unable to cache map filters locally", error);
  }
};

const formatKilometres = (meters?: number | null) => {
  if (!meters || meters <= 0) return "<0.5 km";
  const km = meters / 1000;
  if (km < 1) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km * 10) / 10} km`;
};

const getSessionIdFromMetadata = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const candidate = record.sessionId ?? record.session_id;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

type Bounds = ViewBounds;
type MovePayload = MapMovePayload;

type ToggleOption = "map" | "list";
type FilterChip = { key: string; label: string; onRemove: () => void };
type UnsupportedFilterNotice = { id: string; label: string; onClear: () => void };
type FilterSupportFlags = {
  activityTypes: boolean;
  tags: boolean;
  traits: boolean;
  taxonomyCategories: boolean;
  priceLevels: boolean;
  capacityKey: boolean;
  timeWindow: boolean;
};

const roundCoordinate = (value: number, precision = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(precision)) : 0;

const normaliseBounds = (value: Bounds): Bounds => ({
  sw: { lat: roundCoordinate(value.sw.lat, 5), lng: roundCoordinate(value.sw.lng, 5) },
  ne: { lat: roundCoordinate(value.ne.lat, 5), lng: roundCoordinate(value.ne.lng, 5) },
});

const boundsEqual = (a: Bounds | null, b: Bounds | null): boolean => {
  if (!a || !b) return false;
  return (
    a.sw.lat === b.sw.lat
    && a.sw.lng === b.sw.lng
    && a.ne.lat === b.ne.lat
    && a.ne.lng === b.ne.lng
  );
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
  const [dataMode, setDataMode] = useState<'activities' | 'events' | 'both'>("activities");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [copiedActivityLink, setCopiedActivityLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<MapToast | null>(null);
  const [filters, setFilters] = useState<MapFilterPreferences>(DEFAULT_MAP_FILTER_PREFERENCES);
  const [useTagsForActivityTypes, setUseTagsForActivityTypes] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationErrored, setLocationErrored] = useState(false);
  const [lastFilterSupport, setLastFilterSupport] = useState<FilterSupportFlags | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = useMemo(() => searchParams?.toString() ?? '', [searchParams]);
  const highlightSessionId = searchParams?.get('highlightSession');
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
  const primeCenter = useCallback((next: MapCoordinates) => {
    centerRef.current = next;
    queryCenterRef.current = next;
    setCenter(next);
    setQueryCenter(next);
  }, []);
  const updateFilters = useCallback(
    (updater: (prev: MapFilterPreferences) => MapFilterPreferences) => {
      setFilters((prev) => normaliseMapFilterPreferences(updater(prev)));
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
      navigate(nextUrl as Route, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const showToast = useCallback((message: string, tone: MapToast['tone'] = 'success') => {
    setToastMessage({ message, tone });
  }, []);

  const selectedActivityTypes = filters.activityTypes;
  const selectedTraits = filters.traits;
  const selectedTaxonomyCategories = filters.taxonomyCategories;
  const selectedPriceLevels = filters.priceLevels;
  const selectedCapacityKey = filters.capacityKey;
  const selectedTimeWindow = filters.timeWindow;

  type StringListUpdater = string[] | ((prev: string[]) => string[]);
  type NumberListUpdater = number[] | ((prev: number[]) => number[]);

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

  const setSelectedPriceLevels = useCallback(
    (updater: NumberListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        priceLevels: typeof updater === 'function' ? (updater as (prev: number[]) => number[])(prev.priceLevels) : updater,
      }));
    },
    [updateFilters],
  );

  const setCapacityKey = useCallback(
    (next: CapacityFilterKey) => {
      updateFilters((prev) => ({
        ...prev,
        capacityKey: next,
      }));
    },
    [updateFilters],
  );

  const setTimeWindow = useCallback(
    (next: TimeWindowKey) => {
      updateFilters((prev) => ({
        ...prev,
        timeWindow: next,
      }));
    },
    [updateFilters],
  );

  const filtersForQuery = useMemo(() => {
    const mapped = mapPreferencesToQueryFilters(filters);
    if (!mapped) return undefined;

    let result: typeof mapped | undefined = mapped;
    if (useTagsForActivityTypes && mapped.activityTypes?.length) {
      const { activityTypes, ...rest } = mapped;
      result = {
        ...rest,
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
      if (next.traits && lastFilterSupport.traits === false) {
        delete next.traits;
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

    return result;
  }, [filters, lastFilterSupport, useTagsForActivityTypes]);

  const hydrateAnonymousPreferences = useCallback(() => {
    const next = readLocalMapFilters() ?? DEFAULT_MAP_FILTER_PREFERENCES;
    updateFilters(() => next);
    setPreferencesUserId(null);
    setPreferencesInitialised(true);
  }, [updateFilters]);

  const loadPreferencesForUser = useCallback(
    async (userId: string) => {
      try {
        const remote = await loadUserPreference<MapFilterPreferences>(supabase, userId, "map_filters");
        if (remote) {
          const normalised = normaliseMapFilterPreferences(remote);
          updateFilters(() => normalised);
          writeLocalMapFilters(normalised);
        } else {
          const fallback = readLocalMapFilters();
          const next = fallback ?? DEFAULT_MAP_FILTER_PREFERENCES;
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
      const normalised = normaliseMapFilterPreferences(next);
      writeLocalMapFilters(normalised);
      if (preferencesUserId) {
        try {
          await saveUserPreference(supabase, preferencesUserId, "map_filters", normalised);
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
    let cancelled = false;
    const fallback = () => {
      if (!cancelled && !centerRef.current) {
        primeCenter(FALLBACK_CENTER);
      }
    };
    if ("geolocation" in navigator) {
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
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [primeCenter]);

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
        setIsAuthenticated(Boolean(userId));
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
          setIsAuthenticated(false);
          hydrateAnonymousPreferences();
        }
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const userId = session?.user?.id ?? null;
      setIsAuthenticated(Boolean(userId));
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
  }, [hydrateAnonymousPreferences, loadPreferencesForUser, preferencesUserId]);

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
          return `${origin}/api/nearby`;
        },
        includeCredentials: true,
      }),
    [],
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

  const query = useMemo(
    () =>
      queryCenter
        ? {
            center: queryCenter,
            radiusMeters,
            limit: 150,
            filters: filtersForQuery,
            bounds: bounds ?? undefined,
          }
        : null,
    [queryCenter, radiusMeters, filtersForQuery, bounds],
  );

  const loadActivities = dataMode !== 'events';
  const loadEvents = dataMode !== 'activities';

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

  const stableNearby = useStableNearbyData(nearby);
  const nearbyData = stableNearby.data ?? nearby.data ?? null;

  const activities = nearbyData?.activities ?? EMPTY_ACTIVITIES;
  const filterSupport = nearbyData?.filterSupport ?? null;
  const facets = nearbyData?.facets ?? null;
  const facetActivityTypes = facets?.activityTypes ?? [];
  const facetTags = facets?.tags ?? [];
  const facetTraits = facets?.traits ?? [];
  const facetTaxonomyCategories = facets?.taxonomyCategories ?? [];
  const facetPriceLevels = facets?.priceLevels ?? [];
  const facetCapacityKey = facets?.capacityKey ?? [];
  const facetTimeWindow = facets?.timeWindow ?? [];
  const activityTypesSupported = filterSupport?.activityTypes ?? true;
  const tagsSupported = filterSupport?.tags ?? true;
  const traitsSupported = filterSupport?.traits ?? true;
  const taxonomyCategoriesSupported = filterSupport?.taxonomyCategories ?? false;
  const priceLevelsSupported = filterSupport?.priceLevels ?? false;
  const capacitySupported = filterSupport?.capacityKey ?? false;
  const timeWindowSupported = filterSupport?.timeWindow ?? false;

  useEffect(() => {
    if (!filterSupport) return;
    setLastFilterSupport(filterSupport);
    if (!filterSupport.activityTypes && filterSupport.tags) {
      setUseTagsForActivityTypes(true);
    } else if (filterSupport.activityTypes) {
      setUseTagsForActivityTypes(false);
    }
  }, [filterSupport]);

  const eventsRangeDays = dataMode === 'events' ? 21 : 14;
  const eventsWindow = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + eventsRangeDays * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [eventsRangeDays]);

  const eventsQueryArgs = loadEvents && bounds
    ? {
        sw: bounds.sw,
        ne: bounds.ne,
        from: eventsWindow.from,
        to: eventsWindow.to,
        limit: 200,
      }
    : null;

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
    if (!term) return activities;
    return activities.filter((activity) => {
      const name = activity.name?.toLowerCase() ?? '';
      const venue = activity.venue?.toLowerCase() ?? '';
      const place = activity.place_label?.toLowerCase() ?? '';
      return name.includes(term) || venue.includes(term) || place.includes(term);
    });
  }, [activities, searchTerm]);

  const filteredEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return events;
    return events.filter((eventSummary) => {
      const title = eventSummary.title?.toLowerCase() ?? '';
      const venue = eventSummary.venue_name?.toLowerCase() ?? '';
      const place = eventSummary.place_label?.toLowerCase() ?? '';
      return title.includes(term) || venue.includes(term) || place.includes(term);
    });
  }, [events, searchTerm]);

  useEffect(() => {
    if (!highlightSessionId || !filteredEvents.length) return;
    const match = filteredEvents.find((eventSummary) => {
      if (eventSummary.id === highlightSessionId) return true;
      const sessionId = getSessionIdFromMetadata(eventSummary.metadata);
      return sessionId === highlightSessionId;
    });
    if (!match) return;
    setSelectedEventId(match.id);
    if (dataMode === 'activities') {
      setDataMode('both');
    }
    setViewMode('list');
    const params = new URLSearchParams(searchParamsString);
    params.delete('highlightSession');
    const basePath = pathname ?? '/map';
    const nextUrl = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    router.replace(nextUrl as Route, { scroll: false });
  }, [dataMode, filteredEvents, highlightSessionId, pathname, router, searchParamsString]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const requestedId = params.get('activity');
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
  }, [searchParamsString, selectedActivityId]);

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

  const taxonomyFacetCounts = useMemo(() => {
    const map = new Map<string, number>();
    facetTaxonomyCategories.forEach((entry) => {
      if (entry.value) {
        map.set(entry.value, entry.count);
      }
    });
    return map;
  }, [facetTaxonomyCategories]);

  const availablePriceLevels = useMemo(() => {
    if (!priceLevelsSupported) return [];
    const values: number[] = [];
    if (facetPriceLevels.length) {
      facetPriceLevels.forEach((entry) => {
        const parsed = Number(entry.value);
        if (Number.isFinite(parsed)) values.push(Math.round(parsed));
      });
    } else {
      for (const activity of activities) {
        for (const level of activity.price_levels ?? []) {
          if (typeof level === 'number' && Number.isFinite(level)) values.push(Math.round(level));
        }
      }
    }
    const unique = Array.from(new Set(values.map((value) => Math.min(Math.max(value, 1), PRICE_LEVEL_OPTIONS.length))));
    return unique.sort((a, b) => a - b);
  }, [activities, facetPriceLevels, priceLevelsSupported]);

  const priceLevelFacetCounts = useMemo(() => {
    const map = new Map<number, number>();
    facetPriceLevels.forEach((entry) => {
      const parsed = Number(entry.value);
      if (Number.isFinite(parsed)) {
        map.set(Math.min(Math.max(Math.round(parsed), 1), PRICE_LEVEL_OPTIONS.length), entry.count);
      }
    });
    return map;
  }, [facetPriceLevels]);

  const availablePriceLevelSet = useMemo(() => new Set(availablePriceLevels), [availablePriceLevels]);

  const capacityFacetCounts = useMemo(() => {
    const map = new Map<CapacityFilterKey, number>();
    facetCapacityKey.forEach((entry) => {
      if (entry.value) {
        map.set(entry.value as CapacityFilterKey, entry.count);
      }
    });
    return map;
  }, [facetCapacityKey]);

  const timeWindowFacetCounts = useMemo(() => {
    const map = new Map<TimeWindowKey, number>();
    facetTimeWindow.forEach((entry) => {
      if (entry.value) {
        map.set(entry.value as TimeWindowKey, entry.count);
      }
    });
    return map;
  }, [facetTimeWindow]);

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

  const togglePriceLevel = useCallback(
    (level: number) => {
      setSelectedPriceLevels((prev) => {
        const active = prev.includes(level);
        const next = active ? prev.filter((entry) => entry !== level) : [...prev, level];
        track('map_filter_price', { level, active: !active });
        return next;
      });
    },
    [setSelectedPriceLevels, track],
  );

  const toggleCapacityKey = useCallback(
    (key: CapacityFilterKey) => {
      const next = selectedCapacityKey === key && key !== 'any' ? 'any' : key;
      setCapacityKey(next);
      track('map_filter_capacity', { key, active: next === key && key !== 'any' });
    },
    [selectedCapacityKey, setCapacityKey, track],
  );

  const toggleTimeWindow = useCallback(
    (key: TimeWindowKey) => {
      const next = selectedTimeWindow === key && key !== 'any' ? 'any' : key;
      setTimeWindow(next);
      track('map_filter_time', { key, active: next === key && key !== 'any' });
    },
    [selectedTimeWindow, setTimeWindow, track],
  );

  const resetFilters = () => {
    track('map_filters_reset', {
      activityTypes: selectedActivityTypes.length,
      traits: selectedTraits.length,
      taxonomyCategories: selectedTaxonomyCategories.length,
      priceLevels: selectedPriceLevels.length,
      capacityKey: selectedCapacityKey,
      timeWindow: selectedTimeWindow,
    });
    setSearchTerm('');
    updateFilters(() => DEFAULT_MAP_FILTER_PREFERENCES);
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
      setCenter({ lat: activity.lat, lng: activity.lng });
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

  const sessionId = getSessionIdFromMetadata(eventSummary.metadata);
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
    [...selectedPriceLevels]
      .sort((a, b) => a - b)
      .forEach((level) => {
        chips.push({
          key: `price:${level}`,
          label: `Price ${formatPriceLevelLabel(level)}`,
          onRemove: () => togglePriceLevel(level),
        });
      });
    if (selectedCapacityKey !== 'any') {
      const option = CAPACITY_OPTION_BY_KEY.get(selectedCapacityKey);
      const label = option?.label ?? `Group ${selectedCapacityKey}`;
      chips.push({
        key: `capacity:${selectedCapacityKey}`,
        label,
        onRemove: () => toggleCapacityKey(selectedCapacityKey),
      });
    }
    if (selectedTimeWindow !== 'any') {
      const option = TIME_WINDOW_OPTION_BY_KEY.get(selectedTimeWindow);
      const label = option?.label ?? `Time ${selectedTimeWindow}`;
      chips.push({
        key: `time:${selectedTimeWindow}`,
        label,
        onRemove: () => toggleTimeWindow(selectedTimeWindow),
      });
    }
    return chips;
  }, [
    hasSearchFilter,
    searchTerm,
    selectedActivityTypes,
    selectedTraits,
    selectedTaxonomyCategories,
    selectedPriceLevels,
    selectedCapacityKey,
    selectedTimeWindow,
    setSearchTerm,
    toggleActivityType,
    toggleTrait,
    toggleTaxonomyCategory,
    togglePriceLevel,
    toggleCapacityKey,
    toggleTimeWindow,
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

  const unsupportedFilters = useMemo<UnsupportedFilterNotice[]>(() => {
    if (!filterSupport) return [];
    const notices: UnsupportedFilterNotice[] = [];
    const activityFiltersUnavailable = !filterSupport.activityTypes && !filterSupport.tags;
    if (activityFiltersUnavailable && selectedActivityTypes.length) {
      notices.push({
        id: 'activityTypes',
        label: 'Activity types',
        onClear: () => setSelectedActivityTypes([]),
      });
    }
    if (!filterSupport.traits && selectedTraits.length) {
      notices.push({
        id: 'traits',
        label: 'People traits',
        onClear: () => setSelectedTraits([]),
      });
    }
    if (!filterSupport.taxonomyCategories && selectedTaxonomyCategories.length) {
      notices.push({
        id: 'taxonomy',
        label: 'Taxonomy categories',
        onClear: () => setSelectedTaxonomyCategories([]),
      });
    }
    if (!filterSupport.priceLevels && selectedPriceLevels.length) {
      notices.push({
        id: 'priceLevels',
        label: 'Price levels',
        onClear: () => setSelectedPriceLevels([]),
      });
    }
    if (!filterSupport.capacityKey && selectedCapacityKey !== 'any') {
      notices.push({
        id: 'capacity',
        label: 'Group size',
        onClear: () => setCapacityKey('any'),
      });
    }
    if (!filterSupport.timeWindow && selectedTimeWindow !== 'any') {
      notices.push({
        id: 'timeWindow',
        label: 'Time window',
        onClear: () => setTimeWindow('any'),
      });
    }
    return notices;
  }, [
    filterSupport,
    selectedActivityTypes,
    selectedTraits,
    selectedTaxonomyCategories,
    selectedPriceLevels,
    selectedCapacityKey,
    selectedTimeWindow,
    setCapacityKey,
    setSelectedActivityTypes,
    setSelectedPriceLevels,
    setSelectedTaxonomyCategories,
    setSelectedTraits,
    setTimeWindow,
  ]);

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
    return [...filteredActivities].sort((a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY));
  }, [filteredActivities]);

  const selectedActivity = useMemo(() => {
    if (!selectedActivityId) return null;
    return activities.find((activity) => activity.id === selectedActivityId) ?? null;
  }, [activities, selectedActivityId]);

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
      types: types.slice(0, 3),
      traits: traitsList.slice(0, 3),
      taxonomy: taxonomy.slice(0, 3),
      chips,
      upcomingSessions: selectedActivity.upcoming_session_count ?? 0,
      source: selectedActivity.source ?? null,
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
  const headerTitle = dataMode === 'events' ? 'Nearby events' : dataMode === 'both' ? 'Activities & events nearby' : 'Nearby activities';
  const filteredActivitiesCount = filteredActivities.length;
  const filteredEventsCount = filteredEvents.length;
  const headerSummary = dataMode === 'events'
    ? `Showing ${filteredEventsCount} events in ~${radiusLabel} radius`
    : dataMode === 'both'
      ? `${filteredActivitiesCount} activities · ${filteredEventsCount} events in ~${radiusLabel} radius`
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
    ? 'flex-1 overflow-y-auto px-md py-sm space-y-xl lg:grid lg:grid-cols-2 lg:gap-lg lg:space-y-0'
    : 'flex-1 overflow-y-auto px-md py-sm space-y-xl';
  const listSectionCardClass = isBothView
    ? 'rounded-2xl border border-midnight-border/30 bg-surface px-sm py-sm lg:px-md lg:py-md'
    : '';

  const mapActivities = loadActivities ? filteredActivities : EMPTY_ACTIVITIES;
  const mapEvents = loadEvents ? filteredEvents : EMPTY_EVENTS;
  const mapLoading = (loadActivities && stableNearby.isInitialLoading) || (loadEvents && eventsQuery.isLoading);
  const refreshDisabled = !query || isRefreshing || stableNearby.isRefreshing;
  const filtersButtonDisabled = !loadActivities && !loadEvents;

  const activityListEmpty = loadActivities && !stableNearby.isInitialLoading && filteredActivities.length === 0;
  const eventListEmpty = loadEvents && !eventsQuery.isLoading && filteredEvents.length === 0;
  const activityEmptyCopy = hasSearchFilter
    ? `No activities match "${searchTerm}". Try another name or clear the search.`
    : "No activities match those filters yet. Try widening your search.";
  const eventEmptyCopy = hasSearchFilter
    ? `No events match "${searchTerm}". Try another name or clear the search.`
    : "No events match those filters yet. Try widening your search.";

  if (!center) {
    return (
      <div className="flex h-[calc(100dvh-64px)] items-center justify-center text-sm text-ink-muted">
        {locationErrored ? "Location unavailable. Using default city…" : "Locating you…"}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-midnight-border/40 bg-surface/95 px-md py-sm text-sm">
        <div className="flex flex-wrap items-center gap-xs">
          <button
            type="button"
            onClick={() => changeViewMode("map")}
            className={`rounded-full px-sm py-xxs font-medium ${viewMode === "map" ? "bg-brand-teal text-white" : "bg-surface-alt text-ink-strong"} lg:hidden`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            className={`rounded-full px-sm py-xxs font-medium ${viewMode === "list" ? "bg-brand-teal text-white" : "bg-surface-alt text-ink-strong"} lg:hidden`}
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
                className={`rounded-full px-sm py-xxs text-sm font-medium ${
                    dataMode === mode ? 'bg-brand-teal text-white' : 'bg-surface-alt text-ink-strong hover:bg-ink-subtle'
                }`}
              >
                {mode === 'activities' ? 'Activities' : mode === 'events' ? 'Events' : 'Both'}
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
      {unsupportedFilters.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-md py-sm text-xs text-amber-900">
          <p className="font-semibold text-amber-800">Some filters aren&apos;t applied right now</p>
          <p className="mt-xxs">
            {unsupportedFilters.length === 1
              ? `${unsupportedFilters[0]?.label} is temporarily disabled because fallback sources in this area do not include that metadata.`
              : `The following filters are temporarily disabled because fallback sources in this area do not include that metadata: ${unsupportedFilters
                  .map((filter) => filter.label)
                  .join(', ')}.`}
          </p>
          <div className="mt-xxs flex flex-wrap gap-xs">
            {unsupportedFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={filter.onClear}
                className="rounded-full border border-amber-300 bg-white/70 px-sm py-hairline text-[11px] font-semibold text-amber-800 hover:border-amber-400"
              >
                Clear {filter.label}
              </button>
            ))}
          </div>
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
                <div>
                  <div className="font-semibold uppercase tracking-wide text-brand-teal">Focused activity</div>
                  <div className="text-sm font-semibold text-ink">{selectedActivitySummary.name}</div>
                  <div className="mt-hairline flex items-center gap-xxs">
                    <span aria-hidden>📍</span>
                    <span>{selectedActivitySummary.place}</span>
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
                    {activityEmptyCopy}
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
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                                Activity
                              </div>
                              <div className="mt-xxs flex items-center gap-xxs text-xs text-ink-muted">
                                <span aria-hidden>📍</span>
                                <span>{activitySubtitle}</span>
                              </div>
                              <div className="text-base font-semibold text-ink">{activity.name}</div>
                              <p className="mt-xxs text-[11px] text-ink-muted">Recurring crew meet-up</p>
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
                                View events{upcomingSessions > 0 ? ` (${upcomingSessions})` : ''} →
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
                              Create event
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
              <section className={listSectionCardClass} aria-label="Events list">
                <header className="mb-sm flex items-start gap-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-feedback-warning/10 text-lg">🎟️</span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Events</h3>
                    <p className="text-xs text-ink-muted">One-off happenings around this area.</p>
                  </div>
                </header>
                {eventsQuery.isLoading && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-medium">
                    Loading events…
                  </div>
                )}
                {eventsQuery.isError && (
                  <div className="rounded-lg border border-feedback-danger/30 bg-feedback-danger/5 p-md text-sm text-feedback-danger">
                    {(eventsQuery.error?.message ?? "Failed to load events")}
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
                <p className="text-xs text-ink-muted">Refine by activity, taxonomy, price, and people preferences.</p>
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
              {loadActivities ? (
                <>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{activityTypesSupported ? 'Activity types' : tagsSupported ? 'Activity tags' : 'Activity types'}</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!availableActivityTypes.length ? (
                        !activityTypesSupported && !tagsSupported ? (
                          <p className="text-xs text-ink-muted">Activity types are temporarily unavailable.</p>
                        ) : (
                          <p className="text-xs text-ink-muted">We will populate suggestions as soon as activities load.</p>
                        )
                      ) : null}
                      {availableActivityTypes.map((type) => {
                        const active = selectedActivityTypes.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleActivityType(type)}
                            className={`rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">People traits</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!traitsSupported ? (
                        <p className="text-xs text-ink-muted">People traits are temporarily unavailable.</p>
                      ) : availableTraits.length === 0 ? (
                        <p className="text-xs text-ink-muted">Traits appear when activities provide preferences.</p>
                      ) : null}
                      {availableTraits.map((trait) => {
                        const active = selectedTraits.includes(trait);
                        return (
                          <button
                            key={trait}
                            type="button"
                            onClick={() => toggleTrait(trait)}
                            className={`rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
                          >
                            {trait}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Taxonomy categories</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!taxonomyCategoriesSupported ? (
                        <p className="text-xs text-ink-muted">Taxonomy filters are temporarily unavailable.</p>
                      ) : availableTaxonomyCategories.length === 0 ? (
                        <p className="text-xs text-ink-muted">Categories appear once activities report taxonomy metadata.</p>
                      ) : null}
                      {taxonomyCategoriesSupported && availableTaxonomyCategories.map((category) => {
                        const active = selectedTaxonomyCategories.includes(category);
                        const count = taxonomyFacetCounts.get(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => toggleTaxonomyCategory(category)}
                            className={`rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
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
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Price levels</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!priceLevelsSupported ? (
                        <p className="text-xs text-ink-muted">Price filters are temporarily unavailable.</p>
                      ) : availablePriceLevels.length === 0 ? (
                        <p className="text-xs text-ink-muted">We will populate suggestions as soon as price metadata is available.</p>
                      ) : null}
                      {priceLevelsSupported && PRICE_LEVEL_OPTIONS.filter((option) => availablePriceLevelSet.has(option.level)).map((option) => {
                        const active = selectedPriceLevels.includes(option.level);
                        const count = priceLevelFacetCounts.get(option.level);
                        return (
                          <button
                            key={option.level}
                            type="button"
                            onClick={() => togglePriceLevel(option.level)}
                            className={`min-w-[3rem] rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
                          >
                            <span>{option.label}</span>
                            {typeof count === 'number' ? (
                              <span className="ml-xxs text-[10px] text-ink-muted">({count})</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Group size</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!capacitySupported ? (
                        <p className="text-xs text-ink-muted">Group size filters appear when activities share capacity.</p>
                      ) : null}
                      {capacitySupported && CAPACITY_OPTIONS.map((option) => {
                        const active = selectedCapacityKey === option.key;
                        const count = capacityFacetCounts.get(option.key);
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => toggleCapacityKey(option.key)}
                            className={`rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
                          >
                            <span>{option.label}</span>
                            {option.key !== 'any' && typeof count === 'number' ? (
                              <span className="ml-xxs text-[10px] text-ink-muted">({count})</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Time window</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {!timeWindowSupported ? (
                        <p className="text-xs text-ink-muted">Time-of-day filters appear when activities expose schedule metadata.</p>
                      ) : null}
                      {timeWindowSupported && TIME_WINDOW_OPTIONS.map((option) => {
                        const active = selectedTimeWindow === option.key;
                        const count = timeWindowFacetCounts.get(option.key);
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => toggleTimeWindow(option.key)}
                            className={`rounded-full border px-sm py-xxs text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-midnight-border/40 text-ink-medium hover:border-brand-teal/60 hover:text-brand-teal"}`}
                          >
                            <span>{option.label}</span>
                            {option.key !== 'any' && typeof count === 'number' ? (
                              <span className="ml-xxs text-[10px] text-ink-muted">({count})</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-midnight-border/30 bg-surface-alt px-md py-sm text-xs text-ink-muted">
                  Activity filters (types, taxonomy, price, capacity, and time) are available when viewing activities. Switch to “Activities” or “Both” to adjust those selections.
                </div>
              )}
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
