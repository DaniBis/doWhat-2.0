import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  DEFAULT_RADIUS_METERS,
  MAPBOX_CLUSTER_COLORS,
  MAPBOX_CLUSTER_RADII,
  MAPBOX_CLUSTER_THRESHOLDS,
  MAPBOX_CLUSTER_COUNT_FONT,
  MAPBOX_CLUSTER_COUNT_TEXT_COLOR,
  MAPBOX_CLUSTER_COUNT_TEXT_SIZE,
  MAPBOX_POINT_COLOR,
  MAPBOX_POINT_RADIUS,
  MAPBOX_POINT_STROKE_COLOR,
  MAPBOX_POINT_STROKE_WIDTH,
  MAPBOX_STYLE_URL,
  activitiesToFeatureCollection,
  createNearbyActivitiesFetcher,
  trackAnalyticsEvent,
  type MapActivity,
  type MapActivitiesQuery,
  type MapActivitiesResponse,
  type MapCoordinates,
  useNearbyActivities,
} from '@dowhat/shared';

import { createWebUrl } from '../lib/web';
import { supabase } from '../lib/supabase';
import { createMapboxFallbackHtml } from '../lib/mapboxHtml';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

const resolveMapboxToken = (): string => {
  const fromEnv = (
    process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    ''
  ).trim();
  if (fromEnv) return fromEnv;
  try {
    const extras = (Constants.expoConfig ?? (Constants.manifest as any) ?? {}).extra ?? {};
    const candidate =
      extras?.mapboxAccessToken ||
      extras?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  extras?.EXPO_PUBLIC_MAPBOX_TOKEN ||
      extras?.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
      extras?.NEXT_PUBLIC_MAPBOX_TOKEN ||
      extras?.MAPBOX_ACCESS_TOKEN ||
      '';
    return typeof candidate === 'string' ? candidate.trim() : '';
  } catch {
    return '';
  }
};

const MAPBOX_TOKEN = resolveMapboxToken();

if (__DEV__) {
  console.info('[Map] MAPBOX_TOKEN resolved', MAPBOX_TOKEN ? `${MAPBOX_TOKEN.slice(0, 6)}…` : '(empty)');
}

const mapboxWarningState = { logged: false };
const mapFetcherLogState = { primaryFailureLogged: false, supabaseFailureLogged: false };

type MapboxModuleShape = {
  MapView?: any;
  Camera?: any;
  ShapeSource?: any;
  CircleLayer?: any;
  SymbolLayer?: any;
  UserLocation?: any;
  setAccessToken?: (token: string) => void;
  setTelemetryEnabled?: (enabled: boolean) => void;
};

const Mapbox: MapboxModuleShape | null = (() => {
  try {
    const required = require('@rnmapbox/maps') as
      | MapboxModuleShape
      | { default: MapboxModuleShape };
    const resolved: MapboxModuleShape =
      (required as { default?: MapboxModuleShape }).default ?? (required as MapboxModuleShape);

    if (MAPBOX_TOKEN) {
      resolved.setAccessToken?.(MAPBOX_TOKEN);
    }
    resolved.setTelemetryEnabled?.(false);
    return resolved;
  } catch (error) {
    if (__DEV__ && !mapboxWarningState.logged) {
      mapboxWarningState.logged = true;
      console.warn('[Map] Mapbox native module unavailable – showing fallback UI.', error);
    }
    return null;
  }
})();

const FALLBACK_CENTER: MapCoordinates = { lat: 37.7749, lng: -122.4194 }; // San Francisco default

const clusterCircleLayerStyle = {
  circleColor: [
    'step',
    ['get', 'point_count'],
    MAPBOX_CLUSTER_COLORS[0],
    MAPBOX_CLUSTER_THRESHOLDS[0],
    MAPBOX_CLUSTER_COLORS[1],
    MAPBOX_CLUSTER_THRESHOLDS[1],
    MAPBOX_CLUSTER_COLORS[2],
  ],
  circleRadius: [
    'step',
    ['get', 'point_count'],
    MAPBOX_CLUSTER_RADII[0],
    MAPBOX_CLUSTER_THRESHOLDS[0],
    MAPBOX_CLUSTER_RADII[1],
    MAPBOX_CLUSTER_THRESHOLDS[1],
    MAPBOX_CLUSTER_RADII[2],
  ],
  circleStrokeWidth: MAPBOX_POINT_STROKE_WIDTH,
  circleStrokeColor: MAPBOX_POINT_STROKE_COLOR,
};

const clusterCountStyle = {
  textField: '{point_count_abbreviated}',
  textSize: MAPBOX_CLUSTER_COUNT_TEXT_SIZE,
  textColor: MAPBOX_CLUSTER_COUNT_TEXT_COLOR,
  textFont: MAPBOX_CLUSTER_COUNT_FONT,
};

const pointLayerStyle = {
  circleColor: MAPBOX_POINT_COLOR,
  circleRadius: MAPBOX_POINT_RADIUS,
  circleStrokeWidth: MAPBOX_POINT_STROKE_WIDTH,
  circleStrokeColor: MAPBOX_POINT_STROKE_COLOR,
};

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

type SupabaseActivityRow = {
  id: string;
  name: string | null;
  venue: string | null;
  lat: number | null;
  lng: number | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  participant_preferences?: { preferred_traits: string[] | null }[] | null;
};

const normaliseStringList = (values?: (string | null)[] | null) =>
  (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);

const participantPreferenceFallbackLogged = { value: false };

const isMissingParticipantPreferenceRelationship = (error: { message?: string | null; details?: string | null; hint?: string | null }): boolean => {
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return haystack.includes('activity_participant_preferences') && haystack.includes('relationship');
};

const fetchNearbyFromSupabaseFallback = async (
  query: MapActivitiesQuery,
): Promise<MapActivitiesResponse> => {
  const radiusMeters = Math.max(query.radiusMeters ?? DEFAULT_RADIUS_METERS, 100);
  const limit = Math.max(query.limit ?? 50, 1);
  const requestLimit = Math.max(200, limit * 4);

  const baseSelect = `
      id,
      name,
      venue,
      lat,
      lng,
      activity_types,
      tags,
      traits
    `;

  const selectWithPreferences = `${baseSelect}, participant_preferences:activity_participant_preferences(preferred_traits)`;

  let supabaseRows: SupabaseActivityRow[] | null = null;

  const result = await supabase
    .from('activities')
    .select(selectWithPreferences)
    .limit(requestLimit)
    .returns<SupabaseActivityRow[]>();

  if (result.error) {
    if (isMissingParticipantPreferenceRelationship(result.error)) {
      if (__DEV__ && !participantPreferenceFallbackLogged.value) {
        participantPreferenceFallbackLogged.value = true;
        console.info('[Map] activity_participant_preferences relationship missing; continuing without preference traits.');
      }
      const fallback = await supabase
        .from('activities')
        .select(baseSelect)
        .limit(requestLimit)
        .returns<SupabaseActivityRow[]>();
      if (fallback.error) {
        throw fallback.error;
      }
      supabaseRows = (fallback.data ?? []).map((row) => ({ ...row, participant_preferences: null }));
    } else {
      throw result.error;
    }
  } else {
    supabaseRows = result.data ?? [];
  }

  const filters = query.filters ?? {};
  const desiredTypes = filters.activityTypes?.map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
  const desiredTags = filters.tags?.map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
  const desiredTraits = filters.traits?.map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];

  const withDistance = (supabaseRows ?? [])
    .map((row) => {
      if (typeof row.lat !== 'number' || typeof row.lng !== 'number') return null;
      const activityTypes = normaliseStringList(row.activity_types);
      const tagValues = normaliseStringList(row.tags);
      const traitValues = new Set<string>([
        ...normaliseStringList(row.traits),
        ...((row.participant_preferences ?? [])
          .flatMap((pref) => normaliseStringList(pref?.preferred_traits ?? null)) ?? []),
      ]);

      if (desiredTypes.length && !desiredTypes.some((type) => activityTypes.includes(type))) return null;
      if (desiredTags.length && !desiredTags.some((tag) => tagValues.includes(tag))) return null;
      if (desiredTraits.length && !desiredTraits.some((trait) => traitValues.has(trait))) return null;

      const distance = haversineMeters(query.center.lat, query.center.lng, row.lat, row.lng);
      const uniqueTraits = Array.from(traitValues);

      return {
        row,
        distance,
        traits: uniqueTraits,
      };
    })
    .filter((entry): entry is { row: SupabaseActivityRow; distance: number; traits: string[] } => Boolean(entry));

  withDistance.sort((a, b) => a.distance - b.distance);

  const withinRadius = withDistance.filter((entry) => entry.distance <= radiusMeters);
  const chosen = (withinRadius.length ? withinRadius : withDistance).slice(0, limit);

  const activities: MapActivity[] = chosen.map(({ row, distance, traits }) => ({
    id: row.id,
    name: row.name ?? 'Untitled activity',
    venue: row.venue ?? null,
    lat: row.lat as number,
    lng: row.lng as number,
    distance_m: distance,
    activity_types: row.activity_types ?? null,
    tags: row.tags ?? null,
    traits,
  }));

  return {
    center: query.center,
    radiusMeters,
    count: activities.length,
    activities,
    source: 'supabase-fallback',
  };
};

type ViewMode = 'map' | 'list';

type FilterModalProps = {
  visible: boolean;
  onClose: (reason: 'close' | 'apply') => void;
  availableTypes: string[];
  availableTraits: string[];
  selectedTypes: string[];
  selectedTraits: string[];
  onToggleType: (value: string) => void;
  onToggleTrait: (value: string) => void;
  onClear: () => void;
};

type MapAvailability =
  | { mode: 'native'; reason: null }
  | { mode: 'web'; reason: 'expoGo' | 'fallback' | null }
  | { mode: 'disabled'; reason: 'missingToken' };

const FilterModal = ({
  visible,
  onClose,
  availableTypes,
  availableTraits,
  selectedTypes,
  selectedTraits,
  onToggleType,
  onToggleTrait,
  onClear,
}: FilterModalProps) => (
  <Modal visible={visible} animationType="slide" transparent>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filters</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => onClose('close')} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={availableTypes}
          keyExtractor={(item) => `type-${item}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onToggleType(item)}
              style={selectedTypes.includes(item) ? styles.filterChipActive : styles.filterChip}
            >
              <Text style={selectedTypes.includes(item) ? styles.filterChipTextActive : styles.filterChipText}>{item}</Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={<Text style={styles.modalSectionLabel}>Activity types</Text>}
          ListEmptyComponent={<Text style={styles.modalEmptyLabel}>Types appear once activities load nearby.</Text>}
          ListFooterComponent={
            <View style={styles.modalSectionFooter}>
              <Text style={styles.modalSectionLabel}>People traits</Text>
              <View style={styles.modalChipGrid}>
                {availableTraits.length === 0 ? (
                  <Text style={styles.modalEmptyLabel}>Traits appear when activities specify preferences.</Text>
                ) : (
                  availableTraits.map((trait) => (
                    <TouchableOpacity
                      key={trait}
                      accessibilityRole="button"
                      onPress={() => onToggleTrait(trait)}
                      style={selectedTraits.includes(trait) ? styles.filterChipActive : styles.filterChip}
                    >
                      <Text style={selectedTraits.includes(trait) ? styles.filterChipTextActive : styles.filterChipText}>{trait}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          }
          contentContainerStyle={styles.modalListContent}
        />
        <View style={styles.modalFooter}>
          <TouchableOpacity accessibilityRole="button" onPress={onClear}>
            <Text style={styles.modalClearText}>Clear all</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => onClose('apply')} style={styles.modalApplyButton}>
            <Text style={styles.modalApplyText}>Apply filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const formatKilometres = (meters?: number | null) => {
  if (!meters || meters <= 0) return '<0.5 km';
  const km = meters / 1000;
  return `${Math.round(km * 10) / 10} km`;
};

export default function MapScreen() {
  const executionEnvironment = Constants?.executionEnvironment ?? null;
  const isStoreClient = executionEnvironment === 'storeClient';

  const mapAvailability = useMemo<MapAvailability>(() => {
    if (!MAPBOX_TOKEN) {
      return { mode: 'disabled', reason: 'missingToken' };
    }
    if (Mapbox && Mapbox.MapView && !isStoreClient) {
      return { mode: 'native', reason: null };
    }
    return { mode: 'web', reason: isStoreClient ? 'expoGo' : 'fallback' };
  }, [isStoreClient]);

  const mapMode = mapAvailability.mode;

  const mapUnavailableMessage = useMemo(() => {
    if (mapAvailability.mode === 'disabled') {
      const reason = mapAvailability.reason;
      if (reason === 'missingToken') {
        return 'Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to your .env or app.config to enable the interactive map.';
      }
      if (reason === 'expoGo') {
        return 'Install the custom development build to view the interactive map in Expo Go.';
      }
      return 'Interactive maps are unavailable in this build.';
    }
    return null;
  }, [mapAvailability]);
  const [center, setCenter] = useState<MapCoordinates | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<MapActivity | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const [webReady, setWebReady] = useState(false);
  const lastWebPayloadRef = useRef<string | null>(null);
  const pendingRecentreRef = useRef<{ center: MapCoordinates; zoom?: number } | null>(null);
  const profileCenterAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setHasLocationPermission(false);
            setLocationMessage('Location permission denied. Showing popular activities nearby.');
            setCenter((prev) => prev ?? FALLBACK_CENTER);
          }
          return;
        }
        setHasLocationPermission(true);
        let position = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (!position) {
          position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
        if (position?.coords && !cancelled) {
          setCenter({
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
          });
        } else if (!cancelled) {
          setCenter((prev) => prev ?? FALLBACK_CENTER);
        }
      } catch (error) {
        if (!cancelled) {
          setLocationMessage('Unable to determine your location right now.');
          setCenter((prev) => prev ?? FALLBACK_CENTER);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profileCenterAttemptedRef.current) return;
    if (center && (center.lat !== FALLBACK_CENTER.lat || center.lng !== FALLBACK_CENTER.lng)) return;
    profileCenterAttemptedRef.current = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;
        if (!uid) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('last_lat,last_lng,location')
          .eq('id', uid)
          .maybeSingle<{ last_lat: number | null; last_lng: number | null; location?: string | null }>();
        if (error) return;
        if (data?.last_lat != null && data?.last_lng != null) {
          setCenter({ lat: Number(data.last_lat), lng: Number(data.last_lng) });
          if (data.location) {
            setLocationMessage(`Showing results near ${data.location}`);
          }
        }
      } catch (profileError) {
        if (__DEV__) {
          console.info('[Map] profile location lookup failed', profileError);
        }
      }
    })();
  }, [center]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setIsAuthenticated(Boolean(data.session?.user));
      } catch {
        if (mounted) setIsAuthenticated(false);
      }
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setIsAuthenticated(Boolean(session?.user));
    });
    return () => {
      listener.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  const fetcher = useMemo(() => {
    const baseFetcher = createNearbyActivitiesFetcher({
      buildUrl: () => createWebUrl('/api/nearby').toString(),
      includeCredentials: true,
    });
    return async (args: MapActivitiesQuery & { signal?: AbortSignal }) => {
      const { signal: _signal, ...query } = args;
      try {
        const primary = await baseFetcher(args);
        if (primary.activities?.length) {
          return primary;
        }
        const fallback = await fetchNearbyFromSupabaseFallback(query);
        return fallback;
      } catch (error) {
        if (__DEV__ && !mapFetcherLogState.primaryFailureLogged) {
          mapFetcherLogState.primaryFailureLogged = true;
          console.info('[Map] Nearby API fetch failed, using Supabase fallback', error);
        }
        const fallback = await fetchNearbyFromSupabaseFallback(query).catch((fallbackError) => {
          if (__DEV__ && !mapFetcherLogState.supabaseFailureLogged) {
            mapFetcherLogState.supabaseFailureLogged = true;
            console.info('[Map] Supabase fallback also failed', fallbackError);
          }
          throw fallbackError;
        });
        return fallback;
      }
    };
  }, []);

  const track = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      trackAnalyticsEvent(event, { platform: 'mobile', ...payload });
    },
    [],
  );

  const query = center
    ? {
        center,
        radiusMeters,
        limit: 150,
        filters: {
          activityTypes: selectedActivityTypes,
          traits: selectedTraits,
        },
      }
    : null;

  const nearby = useNearbyActivities(query, {
    fetcher,
    enabled: Boolean(center),
  });

  const activities = nearby.data?.activities ?? [];
  const featureCollection = useMemo(() => activitiesToFeatureCollection(activities), [activities]);

  const selectedPointFilter = useMemo(
    () =>
      selectedActivity
        ? (['all', ['!has', 'point_count'], ['==', ['get', 'id'], selectedActivity.id]] as const)
        : (['all', ['==', ['get', 'id'], '__none__']] as const),
    [selectedActivity],
  );

  const availableActivityTypes = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((activity) => {
      activity.activity_types?.forEach((type) => {
        if (typeof type === 'string' && type.trim()) set.add(type.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const availableTraits = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((activity) => {
      activity.traits?.forEach((trait) => {
        if (typeof trait === 'string' && trait.trim()) set.add(trait.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const toggleType = (value: string) => {
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

  const clearFilters = () => {
    track('map_filters_reset', {
      activityTypes: selectedActivityTypes.length,
      traits: selectedTraits.length,
      platform: 'mobile',
    });
    setSelectedActivityTypes([]);
    setSelectedTraits([]);
  };

  const requireAuth = useCallback(
    (activityId: string) => {
      track('map_activity_details_requested', {
        activityId,
        authenticated: isAuthenticated === true,
      });
      if (isAuthenticated) {
        router.push(`/activities/${activityId}`);
      } else {
        Alert.alert('Sign in required', 'Please sign in to view activity details.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/profile') },
        ]);
      }
    },
    [isAuthenticated, router, track],
  );

  const changeViewMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      track('map_toggle_view', { view: mode });
    },
    [track],
  );

  const handleRegionDidChange = useCallback(async () => {
    if (!cameraRef.current) return;
    const camera = await cameraRef.current.getCamera();
    if (!camera?.centerCoordinate) return;
    const [lng, lat] = camera.centerCoordinate;
    const centerChanged =
      !center ||
      Math.abs(center.lat - lat) > 0.0005 ||
      Math.abs(center.lng - lng) > 0.0005;
    setCenter((prev) => {
      if (!prev) return { lat, lng };
      const deltaLat = Math.abs(prev.lat - lat);
      const deltaLng = Math.abs(prev.lng - lng);
      return deltaLat > 0.0005 || deltaLng > 0.0005 ? { lat, lng } : prev;
    });
    let normalizedRadius = radiusMeters;
    let radiusChanged = false;
    if (mapRef.current?.getVisibleBounds) {
      const bounds = await mapRef.current.getVisibleBounds();
      if (Array.isArray(bounds) && bounds.length === 2) {
        const [[swLng, swLat], [neLng, neLat]] = bounds as [[number, number], [number, number]];
        const diagonal = haversineMeters(swLat, swLng, neLat, neLng);
        if (Number.isFinite(diagonal)) {
          normalizedRadius = Math.max(300, Math.min(30_000, diagonal / 2));
          radiusChanged = Math.abs(normalizedRadius - radiusMeters) > 250;
          setRadiusMeters((prev) => (radiusChanged ? normalizedRadius : prev));
        }
      }
    }
    if (centerChanged || radiusChanged) {
      track('map_region_change', {
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        radiusMeters: normalizedRadius,
        source: 'drag',
      });
    }
  }, [center, radiusMeters, track]);

  const handleShapePress = useCallback(
    async (event: any) => {
      const feature = event?.features?.[0];
      if (!feature || !sourceRef.current) return;
      const coordinates = feature.geometry?.coordinates as [number, number] | undefined;
      if (feature.properties?.cluster) {
        try {
          const zoom = await sourceRef.current.getClusterExpansionZoom(feature.properties.cluster_id);
          if (zoom != null && coordinates && cameraRef.current) {
            cameraRef.current.setCamera({
              centerCoordinate: coordinates,
              zoomLevel: zoom + 0.5,
              animationDuration: 400,
            });
          }
        } catch (error) {
          console.warn('Cluster expansion failed', error);
        }
        return;
      }
      const id = feature.properties?.id as string | undefined;
      if (!id) return;
      const match = activities.find((activity) => activity.id === id);
      if (match) {
        setSelectedActivity(match);
        track('map_activity_focus', { activityId: match.id, source: 'map' });
      }
    },
    [activities, track],
  );

  const focusActivity = useCallback(
    (activity: MapActivity) => {
      if (!activity.lat || !activity.lng) return;
      track('map_activity_focus', { activityId: activity.id, source: 'list' });
      if (mapMode === 'native' && cameraRef.current?.setCamera) {
        cameraRef.current.setCamera({
          centerCoordinate: [activity.lng, activity.lat],
          zoomLevel: 14,
          animationDuration: 400,
        });
      } else if (mapMode === 'web') {
        pendingRecentreRef.current = { center: { lat: activity.lat, lng: activity.lng }, zoom: 14 };
      }
      setCenter({ lat: activity.lat, lng: activity.lng });
      setSelectedActivity(activity);
      changeViewMode('map');
    },
    [changeViewMode, mapMode, track],
  );

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY),
      ),
    [activities],
  );

  const activeFiltersCount = selectedActivityTypes.length + selectedTraits.length;

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
    if (mapMode !== 'web') {
      setWebReady(false);
      lastWebPayloadRef.current = null;
      pendingRecentreRef.current = null;
    }
  }, [mapMode]);

  useEffect(() => {
    if (mapMode === 'disabled' && viewMode !== 'list') {
      setViewMode('list');
    }
  }, [mapMode, viewMode]);

  useEffect(() => {
    if (mapMode === 'web' && viewMode !== 'map') {
      setWebReady(false);
      pendingRecentreRef.current = null;
    }
  }, [mapMode, viewMode]);

  useEffect(() => {
    if (mapMode === 'web' && center && !webReady) {
      pendingRecentreRef.current = { center, zoom: 12 };
    }
  }, [mapMode, center, webReady]);

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const dataString = event.nativeEvent?.data;
      if (!dataString) return;
      let payload: any;
      try {
        payload = JSON.parse(dataString);
      } catch (error) {
        if (__DEV__) console.warn('[map:web] invalid message', error);
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'ready') {
        setWebReady(true);
        lastWebPayloadRef.current = null;
        return;
      }
      if (payload.type === 'move') {
        const nextCenter = payload.center as MapCoordinates | undefined;
        const nextRadius = typeof payload.radiusMeters === 'number' ? payload.radiusMeters : undefined;
        if (nextCenter) {
          setCenter((prev) => {
            if (!prev) return nextCenter;
            const deltaLat = Math.abs(prev.lat - nextCenter.lat);
            const deltaLng = Math.abs(prev.lng - nextCenter.lng);
            return deltaLat > 0.0005 || deltaLng > 0.0005 ? nextCenter : prev;
          });
        }
        if (typeof nextRadius === 'number' && Number.isFinite(nextRadius)) {
          setRadiusMeters((prev) => (Math.abs(prev - nextRadius) > 250 ? nextRadius : prev));
        }
        return;
      }
      if (payload.type === 'select' && payload.activityId) {
        const match = activities.find((activity) => activity.id === payload.activityId);
        if (match) {
          setSelectedActivity(match);
          track('map_activity_focus', { activityId: match.id, source: 'map' });
        }
      }
    },
    [activities, track],
  );

  useEffect(() => {
    if (mapMode !== 'web' || !webReady || !center || !webViewRef.current) return;
    const payload = {
      type: 'update' as const,
      featureCollection,
      selectedActivityId: selectedActivity?.id ?? null,
      recenter: Boolean(pendingRecentreRef.current),
      center: pendingRecentreRef.current?.center,
      zoom: pendingRecentreRef.current?.zoom,
      animate: Boolean(pendingRecentreRef.current),
    };
    pendingRecentreRef.current = null;
    const serialized = JSON.stringify(payload);
    if (serialized === lastWebPayloadRef.current) return;
    webViewRef.current.postMessage(serialized);
    lastWebPayloadRef.current = serialized;
  }, [mapMode, webReady, center, featureCollection, selectedActivity?.id]);

  const renderMap = () => {
    if (mapMode === 'native' && Mapbox && Mapbox.MapView) {
      const MapboxGL = Mapbox as MapboxModuleShape;
      if (!center) {
        return (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#10b981" />
            <Text style={styles.loaderLabel}>Locating…</Text>
          </View>
        );
      }
      return (
        <View style={styles.mapContainer}>
          <MapboxGL.MapView
            ref={mapRef}
            styleURL={MAPBOX_STYLE_URL}
            style={styles.mapView}
            onRegionDidChange={handleRegionDidChange}
            onPress={() => setSelectedActivity(null)}
          >
            <MapboxGL.Camera ref={cameraRef} centerCoordinate={[center.lng, center.lat]} zoomLevel={12} />
            {hasLocationPermission && <MapboxGL.UserLocation visible />}
            <MapboxGL.ShapeSource
              id="activities"
              ref={sourceRef}
              shape={featureCollection as any}
              cluster
              clusterRadius={48}
              clusterMaxZoom={16}
              onPress={handleShapePress}
            >
              <MapboxGL.CircleLayer id="activity-clusters" belowLayerID="cluster-count" style={clusterCircleLayerStyle} />
              <MapboxGL.SymbolLayer id="cluster-count" style={clusterCountStyle} />
              <MapboxGL.CircleLayer
                id="activity-points"
                belowLayerID="cluster-count"
                filter={['!has', 'point_count']}
                style={pointLayerStyle}
              />
              <MapboxGL.CircleLayer
                id="selected-point"
                aboveLayerID="activity-points"
                filter={selectedPointFilter as unknown as any[]}
                style={{
                  circleColor: '#ffffff',
                  circleRadius: MAPBOX_POINT_RADIUS + 6,
                  circleStrokeColor: MAPBOX_POINT_COLOR,
                  circleStrokeWidth: 4,
                }}
              />
            </MapboxGL.ShapeSource>
          </MapboxGL.MapView>
          {nearby.isLoading && (
            <View style={styles.loadingBadge}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.loadingBadgeText}>Loading activities…</Text>
            </View>
          )}
          {locationMessage && (
            <View style={styles.locationBanner}>
              <Text style={styles.locationBannerText}>{locationMessage}</Text>
            </View>
          )}
        </View>
      );
    }

    if (mapMode === 'web') {
      if (!center) {
        return (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#10b981" />
            <Text style={styles.loaderLabel}>Locating…</Text>
          </View>
        );
      }
      return (
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: createMapboxFallbackHtml(MAPBOX_TOKEN, MAPBOX_STYLE_URL) }}
            onMessage={handleWebMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loaderContainer}>
                <ActivityIndicator color="#10b981" />
                <Text style={styles.loaderLabel}>Loading map…</Text>
              </View>
            )}
            style={styles.mapView}
          />
          {nearby.isLoading && (
            <View style={styles.loadingBadge}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.loadingBadgeText}>Loading activities…</Text>
            </View>
          )}
          {locationMessage && (
            <View style={styles.locationBanner}>
              <Text style={styles.locationBannerText}>{locationMessage}</Text>
            </View>
          )}
        </View>
      );
    }

    return (
      <View style={styles.mapFallback}>
        <Text style={styles.mapFallbackTitle}>Map unavailable</Text>
        <Text style={styles.mapFallbackText}>{mapUnavailableMessage ?? 'Interactive maps are unavailable in this build.'}</Text>
      </View>
    );
  };

  const renderList = () => (
    <FlatList
      data={sortedActivities}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        nearby.isLoading ? (
          <View style={styles.listEmptyState}>
            <ActivityIndicator color="#10b981" />
            <Text style={styles.listEmptyText}>Loading nearby activities…</Text>
          </View>
        ) : (
          <View style={styles.listEmptyState}>
            <Text style={styles.listEmptyText}>No activities match those filters yet.</Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => focusActivity(item)}
          style={styles.listCard}
        >
          <View style={styles.listCardHeader}>
            <View>
              <Text style={styles.listCardTitle}>{item.name}</Text>
              {item.venue && <Text style={styles.listCardVenue}>📍 {item.venue}</Text>}
            </View>
            {item.distance_m != null && (
              <Text style={styles.listCardDistance}>~{formatKilometres(item.distance_m)}</Text>
            )}
          </View>
          {item.activity_types && item.activity_types.length > 0 && (
            <View style={styles.listCardChips}>
              {item.activity_types.slice(0, 3).map((type) => (
                <View key={type} style={styles.listChip}>
                  <Text style={styles.listChipText}>{type}</Text>
                </View>
              ))}
              {item.activity_types.length > 3 && (
                <View style={styles.listChipMuted}>
                  <Text style={styles.listChipMutedText}>+{item.activity_types.length - 3}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.listCardFooter}>
            <Pressable onPress={() => requireAuth(item.id)} hitSlop={8}>
              <Text style={styles.listDetailsLink}>View details →</Text>
            </Pressable>
            <Pressable onPress={() => focusActivity(item)} hitSlop={8}>
              <Text style={styles.listShowOnMap}>Show on map</Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      )}
    />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.toggleGroup}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => changeViewMode('map')}
            disabled={mapMode === 'disabled'}
            style={
              mapMode === 'disabled'
                ? styles.toggleDisabled
                : viewMode === 'map'
                ? styles.toggleActive
                : styles.toggle
            }
          >
            <Text
              style={
                mapMode === 'disabled'
                  ? styles.toggleTextDisabled
                  : viewMode === 'map'
                  ? styles.toggleTextActive
                  : styles.toggleText
              }
            >
              Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => changeViewMode('list')}
            style={viewMode === 'list' ? styles.toggleActive : styles.toggle}
          >
            <Text style={viewMode === 'list' ? styles.toggleTextActive : styles.toggleText}>List</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.filterButton}
          onPress={() => {
            setFiltersVisible(true);
            track('map_filters_opened');
          }}
        >
          <Text style={styles.filterButtonText}>Filters</Text>
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {mapMode === 'disabled' && mapUnavailableMessage && (
        <View style={styles.mapBanner}>
          <Text style={styles.mapBannerText}>{mapUnavailableMessage}</Text>
        </View>
      )}
      <View style={styles.content}>{viewMode === 'map' ? renderMap() : renderList()}</View>

      {viewMode === 'map' && selectedActivity && (
        <View style={styles.selectedCard}>
          <View style={styles.selectedCardHeader}>
            <Text style={styles.selectedCardTitle}>{selectedActivity.name}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedActivity(null)}>
              <Text style={styles.selectedClose}>Close</Text>
            </TouchableOpacity>
          </View>
          {selectedActivity.venue && <Text style={styles.selectedVenue}>📍 {selectedActivity.venue}</Text>}
          {selectedActivity.distance_m != null && (
            <Text style={styles.selectedDistance}>~{formatKilometres(selectedActivity.distance_m)} away</Text>
          )}
          <View style={styles.selectedActions}>
            <Pressable
              style={styles.selectedPrimaryAction}
              onPress={() => requireAuth(selectedActivity.id)}
            >
              <Text style={styles.selectedPrimaryActionText}>View details</Text>
            </Pressable>
            <Pressable onPress={() => focusActivity(selectedActivity)}>
              <Text style={styles.selectedSecondaryAction}>Center map</Text>
            </Pressable>
          </View>
        </View>
      )}

      <FilterModal
        visible={filtersVisible}
        onClose={(reason) => {
          setFiltersVisible(false);
          track('map_filters_closed', { via: reason });
        }}
        availableTypes={availableActivityTypes}
        availableTraits={availableTraits}
        selectedTypes={selectedActivityTypes}
        selectedTraits={selectedTraits}
        onToggleType={toggleType}
        onToggleTrait={toggleTrait}
        onClear={clearFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    zIndex: 10,
  },
  mapBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fef3c7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#facc15',
  },
  mapBannerText: {
    fontSize: 13,
    color: '#92400e',
    textAlign: 'center',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    padding: 4,
  },
  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleDisabled: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    opacity: 0.4,
  },
  toggleActive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#10b981',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  toggleTextDisabled: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#ecfdf5',
  },
  filterButtonText: {
    color: '#047857',
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapView: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mapFallbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b91c1c',
  },
  mapFallbackText: {
    marginTop: 8,
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderLabel: {
    fontSize: 14,
    color: '#475569',
    marginTop: 8,
  },
  loadingBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5f5',
  },
  loadingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    marginLeft: 8,
  },
  locationBanner: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 12,
    padding: 12,
  },
  locationBannerText: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  listEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  listEmptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
  },
  listCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  listCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  listCardVenue: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  listCardDistance: {
    fontSize: 12,
    color: '#64748b',
  },
  listCardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  listChip: {
    backgroundColor: '#d1fae5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  listChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  listChipMuted: {
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  listChipMutedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0891b2',
  },
  listCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  listDetailsLink: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '600',
  },
  listShowOnMap: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  selectedClose: {
    fontSize: 12,
    color: '#64748b',
  },
  selectedVenue: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  selectedDistance: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  selectedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  selectedPrimaryAction: {
    backgroundColor: '#047857',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  selectedPrimaryActionText: {
    color: 'white',
    fontWeight: '600',
  },
  selectedSecondaryAction: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '80%',
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalCloseText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  modalListContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  modalChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalEmptyLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  filterChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#d1fae5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    marginRight: 8,
  },
  filterChipText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSectionFooter: {
    marginTop: 24,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  modalClearText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  modalApplyButton: {
    backgroundColor: '#047857',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalApplyText: {
    color: 'white',
    fontWeight: '700',
  },
});
