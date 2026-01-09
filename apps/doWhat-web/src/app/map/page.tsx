"use client";

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
  useEvents,
  useNearbyActivities,
  DEFAULT_MAP_FILTER_PREFERENCES,
  normaliseMapFilterPreferences,
  mapPreferencesToQueryFilters,
  type MapFilterPreferences,
  loadUserPreference,
  saveUserPreference,
  isUuid,
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

const WebMap = dynamic(() => import("@/components/WebMap"), { ssr: false });

const FALLBACK_CENTER: MapCoordinates = { lat: 51.5074, lng: -0.1278 }; // London default
const EMPTY_ACTIVITIES: MapActivity[] = [];
const EMPTY_EVENTS: EventSummary[] = [];
const MAP_FILTERS_LOCAL_KEY = "map_filters:v1";
const MOVE_END_DEBOUNCE_MS = 250;
const CENTER_UPDATE_THRESHOLD = 0.0005;

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
  const [filters, setFilters] = useState<MapFilterPreferences>(DEFAULT_MAP_FILTER_PREFERENCES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationErrored, setLocationErrored] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightSessionId = searchParams?.get('highlightSession');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);
  const [preferencesInitialised, setPreferencesInitialised] = useState(false);
  const centerRef = useRef<MapCoordinates | null>(center);
  const queryCenterRef = useRef<MapCoordinates | null>(queryCenter);
  const radiusRef = useRef(radiusMeters);
  const boundsRef = useRef<Bounds | null>(bounds);
  const dataModeRef = useRef(dataMode);
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

  const selectedActivityTypes = filters.activityTypes;
  const selectedTraits = filters.traits;

  type ListUpdater = string[] | ((prev: string[]) => string[]);

  const setSelectedActivityTypes = useCallback(
    (updater: ListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        activityTypes: typeof updater === 'function' ? (updater as (prev: string[]) => string[])(prev.activityTypes) : updater,
      }));
    },
    [updateFilters],
  );

  const setSelectedTraits = useCallback(
    (updater: ListUpdater) => {
      updateFilters((prev) => ({
        ...prev,
        traits: typeof updater === 'function' ? (updater as (prev: string[]) => string[])(prev.traits) : updater,
      }));
    },
    [updateFilters],
  );

  const filtersForQuery = useMemo(() => mapPreferencesToQueryFilters(filters), [filters]);

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
          }
        : null,
    [queryCenter, radiusMeters, filtersForQuery],
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

  const activities = nearby.data?.activities ?? EMPTY_ACTIVITIES;

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
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('highlightSession');
    const basePath = pathname ?? '/map';
    const nextUrl = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    router.replace(nextUrl as Route, { scroll: false });
  }, [dataMode, filteredEvents, highlightSessionId, pathname, router, searchParams]);

  const availableActivityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const activity of activities) {
      for (const type of activity.activity_types ?? []) {
        if (typeof type === "string" && type.trim()) set.add(type.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const availableTraits = useMemo(() => {
    const set = new Set<string>();
    for (const activity of activities) {
      for (const trait of activity.traits ?? []) {
        if (typeof trait === "string" && trait.trim()) set.add(trait.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const toggleActivityType = (value: string) => {
    setSelectedActivityTypes((prev) => {
      const active = prev.includes(value);
      const next = active ? prev.filter((v) => v !== value) : [...prev, value];
      track('map_filter_activity', { value, active: !active });
      return next;
    });
  };
  const toggleTrait = (value: string) => {
    setSelectedTraits((prev) => {
      const active = prev.includes(value);
      const next = active ? prev.filter((v) => v !== value) : [...prev, value];
      track('map_filter_trait', { value, active: !active });
      return next;
    });
  };

  const resetFilters = () => {
    track('map_filters_reset', {
      activityTypes: selectedActivityTypes.length,
      traits: selectedTraits.length,
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
    },
    [track],
  );

  const handleEventSelect = useCallback(
    (eventSummary: EventSummary) => {
      setSelectedEventId(eventSummary.id);
      setSelectedActivityId(null);
      track('map_event_focus', { eventId: eventSummary.id, source: 'map' });
    },
    [track],
  );

  const handleFocusActivity = useCallback(
    (activity: MapActivity) => {
      if (!activity.lat || !activity.lng) return;
      setSelectedActivityId(activity.id);
      setSelectedEventId(null);
      track('map_activity_focus', { activityId: activity.id, source: 'list' });
      changeViewMode('map');
      setCenter({ lat: activity.lat, lng: activity.lng });
    },
    [changeViewMode, track],
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
    },
    [changeViewMode, track],
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
  const activeFiltersCount =
    selectedActivityTypes.length +
    selectedTraits.length +
    (hasSearchFilter ? 1 : 0);

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
    }
    if (dataMode === 'activities') {
      setSelectedEventId(null);
    }
  }, [dataMode]);

  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY));
  }, [filteredActivities]);

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
  const mapLoading = (loadActivities && nearby.isLoading) || (loadEvents && eventsQuery.isLoading);
  const filtersButtonDisabled = !loadActivities && !loadEvents;

  const activityListEmpty = loadActivities && !nearby.isLoading && filteredActivities.length === 0;
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
                {nearby.isLoading && (
                  <div className="rounded-lg border border-midnight-border/40 bg-surface-alt p-md text-sm text-ink-medium">
                    Loading nearby activities…
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
                <p className="text-xs text-ink-muted">Refine by activity and people preferences.</p>
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
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Activity types</div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {availableActivityTypes.length === 0 && (
                        <p className="text-xs text-ink-muted">We will populate suggestions as soon as activities load.</p>
                      )}
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
                      {availableTraits.length === 0 && (
                        <p className="text-xs text-ink-muted">Traits appear when activities provide preferences.</p>
                      )}
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
                </>
              ) : (
                <div className="rounded-xl border border-midnight-border/30 bg-surface-alt px-md py-sm text-xs text-ink-muted">
                  Activity-type and trait filters are available when viewing activities. Switch to “Activities” or “Both” to adjust those selections.
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
    </div>
  );
}
