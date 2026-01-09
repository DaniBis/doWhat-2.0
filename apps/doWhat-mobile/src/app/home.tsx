import { supabase } from "../lib/supabase";
import { fetchSupabasePlacesWithinBounds } from "../lib/supabasePlaces";
import { ensureBackgroundLocation, getLastKnownBackgroundLocation } from "../lib/bg-location";
import {
  normaliseActivityName,
  formatPrice,
  formatDateRange,
  formatPlaceUpdatedLabel,
  DEFAULT_CITY_SLUG,
  getCityConfig,
  theme,
  buildPlaceSavePayload,
  buildActivitySavePayload,
  buildSessionSavePayload,
  trackFindA4thCardTap,
  trackFindA4thImpression,
  fetchOverpassPlaceSummaries,
  estimateRadiusFromBounds,
  type PlaceSummary,
  type PlacesViewportQuery,
  type ActivityRow,
  type SavePayload,
} from "@dowhat/shared";
import * as Location from 'expo-location';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoRouter = require("expo-router");
const { Link, useFocusEffect, router } = ExpoRouter;
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Dimensions, Platform, Alert } from "react-native";
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
import Brand from '../components/Brand';
import ActivityIcon from '../components/ActivityIcon';
import { Ionicons } from '@expo/vector-icons';
import SessionAttendanceBadges from "../components/SessionAttendanceBadges";
import SessionAttendanceQuickActions from "../components/SessionAttendanceQuickActions";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";
import OnboardingNavPrompt from "../components/OnboardingNavPrompt";
import FindA4thHero, { type FindA4thHeroSession } from "../components/FindA4thHero";
import type { Session } from '@supabase/supabase-js';
import { resolveCategoryAppearance, resolvePrimaryCategoryKey, formatCategoryLabel } from '../lib/placeCategories';
import { useSavedActivities } from "../contexts/SavedActivitiesContext";
import { useRankedOpenSessions } from '../hooks/useRankedOpenSessions';

const { width: screenWidth } = Dimensions.get('window');

// Map activity names/ids to icons and colors (customize as needed)
const activityVisuals: Record<string, { icon: string; color: string; bgColor: string }> = {
  'Rock Climbing': { icon: '🧗', color: '#FF6B35', bgColor: '#FFF4F1' },
  'Running': { icon: '🏃', color: '#4ECDC4', bgColor: '#F0FDFC' },
  'Yoga': { icon: '🧘', color: '#45B7D1', bgColor: '#F0F9FF' },
  'Cycling': { icon: '🚴', color: '#96CEB4', bgColor: '#F0FDF4' },
  'Swimming': { icon: '🏊', color: '#FFEAA7', bgColor: '#FFFBEB' },
  'Hiking': { icon: '🥾', color: '#DDA0DD', bgColor: '#FAF5FF' },
  'Soccer': { icon: '⚽', color: '#FF7675', bgColor: '#FEF2F2' },
  'Basketball': { icon: '🏀', color: '#74B9FF', bgColor: '#EFF6FF' },
  'Tennis': { icon: '🎾', color: '#00B894', bgColor: '#ECFDF5' },
  'Golf': { icon: '⛳', color: '#FDCB6E', bgColor: '#FFFBEB' },
  'Skiing': { icon: '⛷️', color: '#6C5CE7', bgColor: '#F5F3FF' },
  'Surfing': { icon: '🏄', color: '#00CED1', bgColor: '#F0FDFA' },
};

const defaultVisual = { icon: '🎯', color: '#FF6B35', bgColor: '#FFF4F1' };

type SaveBadgeVariant = 'dark' | 'light';

type SaveBadgeProps = {
  saved: boolean;
  saving?: boolean;
  disabled?: boolean;
  variant?: SaveBadgeVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
};

const resolveSaveBadgePalette = (variant: SaveBadgeVariant, saved: boolean) => {
  if (variant === 'dark') {
    return {
      container: {
        borderColor: saved ? 'rgba(16,185,129,0.65)' : 'rgba(148,163,184,0.45)',
        backgroundColor: saved ? 'rgba(16,185,129,0.18)' : 'rgba(2,6,23,0.7)',
      },
      labelColor: saved ? '#34D399' : '#E2E8F0',
      iconColor: saved ? '#34D399' : '#E2E8F0',
    } as const;
  }
  return {
    container: {
      borderColor: saved ? 'rgba(4,120,87,0.32)' : 'rgba(15,23,42,0.08)',
      backgroundColor: saved ? '#D1FAE5' : '#FFFFFF',
      shadowColor: 'rgba(15,23,42,0.08)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    labelColor: saved ? '#047857' : '#0F172A',
    iconColor: saved ? '#047857' : '#0F172A',
  } as const;
};

const SaveBadge = ({ saved, saving = false, disabled = false, variant = 'light', style, onPress }: SaveBadgeProps) => {
  const palette = resolveSaveBadgePalette(variant, saved);
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        event.preventDefault?.();
        if (disabled || saving || !onPress) return;
        onPress();
      }}
      disabled={disabled || saving || !onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 6,
          gap: 6,
          opacity: disabled || saving || !onPress ? 0.6 : 1,
        },
        palette.container,
        style,
      ]}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={14} color={palette.iconColor} />
      <Text style={{ color: palette.labelColor, fontWeight: '700', fontSize: 12 }}>
        {saved ? 'Saved' : 'Save'}
      </Text>
    </Pressable>
  );
};

type NearbyActivity = { id: string; name: string; count: number };

type ProfileLocationRow = {
  last_lat: number | null;
  last_lng: number | null;
};


const lookingForPlayersFeatureEnabled = !(
  process.env.EXPO_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS === "false" ||
  process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS === "false"
);

const FIND_A_FOURTH_SURFACE = 'home_find_fourth';


function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === 'android';
  const { isSaved, pendingIds, toggle } = useSavedActivities();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredActivities, setFilteredActivities] = useState<NearbyActivity[]>([]);
  const nearbyApiFailureLogged = useRef(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceSummary[]>([]);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const placesFetchFailureLogged = useRef(false);
  const findA4thImpressionLogged = useRef(false);
  const {
    sessions: recruitingSessions,
    isLoading: recruitingLoading,
    error: recruitingError,
    refresh: refreshRankedOpenSessions,
  } = useRankedOpenSessions({ enabled: lookingForPlayersFeatureEnabled, autoRefresh: false });
  const defaultCity = useMemo(() => getCityConfig(DEFAULT_CITY_SLUG), []);

    const FALLBACK_RADIUS_METERS = 2500;

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

    const fetchNearbyFromSupabase = useCallback(async (latNow: number, lngNow: number) => {
      const { data, error } = await supabase
        .from('sessions')
        .select(
          `id, activity_id,
           activities!inner(id, name),
           venues!inner(id, name, venue_lat:lat, venue_lng:lng)`
        )
        .not('venues.lat', 'is', null)
        .not('venues.lng', 'is', null)
        .gte('starts_at', new Date().toISOString())
        .limit(200);

      if (error) throw error;
      const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
      const grouped = rows.reduce<Record<string, NearbyActivity>>((acc, row) => {
        const venues = Array.isArray(row.venues)
          ? (row.venues[0] as Record<string, unknown> | undefined)
          : (row.venues as Record<string, unknown> | undefined);
        const activities = Array.isArray(row.activities)
          ? (row.activities[0] as Record<string, unknown> | undefined)
          : (row.activities as Record<string, unknown> | undefined);

  const latValue = (venues?.venue_lat ?? venues?.lat) as unknown;
  const lngValue = (venues?.venue_lng ?? venues?.lng) as unknown;
        const lat =
          typeof latValue === 'number'
            ? latValue
            : latValue != null && latValue !== ''
              ? Number(latValue)
              : NaN;
        const lng =
          typeof lngValue === 'number'
            ? lngValue
            : lngValue != null && lngValue !== ''
              ? Number(lngValue)
              : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
        const distance = haversineMeters(latNow, lngNow, lat, lng);
        if (!Number.isFinite(distance) || distance > FALLBACK_RADIUS_METERS) return acc;
        const idRaw =
          (row.activity_id as string | null | undefined) ??
          (activities?.id as string | null | undefined) ??
          (activities?.name as string | null | undefined) ??
          (row.id as string | null | undefined);
        if (!idRaw) return acc;
        const key = String(idRaw);
        const name = typeof activities?.name === 'string' && activities.name.trim()
          ? activities.name
          : key;
        const groupKey = normaliseActivityName(name);
        const existing = acc[groupKey];
        if (existing) {
          existing.count += 1;
        } else {
          acc[groupKey] = { id: groupKey, name, count: 1 };
        }
        return acc;
      }, {});
      return Object.values(grouped).sort((a, b) => b.count - a.count);
    }, []);

  const fetchNearbyActivities = useCallback(async (latNow: number | null, lngNow: number | null) => {
    if (latNow == null || lngNow == null) {
      setActivities([]);
      return;
    }
    try {
      const grouped = await fetchNearbyFromSupabase(latNow, lngNow);
      setActivities(grouped);
      nearbyApiFailureLogged.current = false;
    } catch (error) {
      if (__DEV__ && !nearbyApiFailureLogged.current) {
        nearbyApiFailureLogged.current = true;
        console.info('[Home] Nearby Supabase query failed', error);
      }
      setActivities([]);
    }
  }, [fetchNearbyFromSupabase]);

  const fetchPlacesViewport = useCallback(
    async (latNow: number | null, lngNow: number | null) => {
      const city = defaultCity;
      const hasLocation = latNow != null && lngNow != null;
      const latitudeDelta = hasLocation
        ? Math.max(city.defaultRegion.latitudeDelta * 0.6, 0.05)
        : city.defaultRegion.latitudeDelta;
      const longitudeDelta = hasLocation
        ? Math.max(city.defaultRegion.longitudeDelta * 0.6, 0.05)
        : city.defaultRegion.longitudeDelta;
      const centerLat = hasLocation ? latNow! : city.center.lat;
      const centerLng = hasLocation ? lngNow! : city.center.lng;
      const bounds: PlacesViewportQuery['bounds'] = {
        sw: { lat: centerLat - latitudeDelta / 2, lng: centerLng - longitudeDelta / 2 },
        ne: { lat: centerLat + latitudeDelta / 2, lng: centerLng + longitudeDelta / 2 },
      };

      let primaryError: unknown = null;
      const fallbackCenterLat = (bounds.ne.lat + bounds.sw.lat) / 2;
      const fallbackCenterLng = (bounds.ne.lng + bounds.sw.lng) / 2;
      try {
        const supabasePlaces = await fetchSupabasePlacesWithinBounds({
          bounds,
          citySlug: city.slug,
          limit: 80,
        });
        setNearbyPlaces(supabasePlaces ?? []);
        setPlacesError(null);
        placesFetchFailureLogged.current = false;
        if (__DEV__) {
          console.log('[Home] Supabase places fetch success', supabasePlaces.length, 'places');
        }
        return;
      } catch (err) {
        primaryError = err;
        if (__DEV__ && !placesFetchFailureLogged.current) {
          placesFetchFailureLogged.current = true;
          console.warn('[Home] Supabase places fetch failed', err);
        }
      }

      try {
        const fallbackRadiusMeters = estimateRadiusFromBounds(bounds);
        const fallbackPlaces = await fetchOverpassPlaceSummaries({
          lat: fallbackCenterLat,
          lng: fallbackCenterLng,
          radiusMeters: fallbackRadiusMeters,
          limit: 30,
        });
        if (fallbackPlaces.length) {
          setNearbyPlaces(fallbackPlaces);
          setPlacesError('Showing fallback nearby venues while Supabase recovers.');
          return;
        }
      } catch (fallbackError) {
        if (__DEV__ && placesFetchFailureLogged.current) {
          console.warn('[Home] Places fallback failed', fallbackError);
        }
      }

      setNearbyPlaces([]);
      const defaultMessage = 'Unable to load nearby places from Supabase.';
      setPlacesError(
        primaryError instanceof Error ? `${defaultMessage}\n${primaryError.message}` : defaultMessage,
      );
    },
    [defaultCity],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getSession();
      setSession(auth.session ?? null);
      const userId = auth.session?.user?.id ?? null;

      let latNow: number | null = null;
      let lngNow: number | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (last?.coords) {
          latNow = Number(last.coords.latitude.toFixed(6));
          lngNow = Number(last.coords.longitude.toFixed(6));
        }
      } catch {}
      if (latNow == null || lngNow == null) {
        try {
          const cached = await getLastKnownBackgroundLocation();
          if (cached) {
            latNow = cached.lat;
            lngNow = cached.lng;
          }
        } catch {}
      }
      if (latNow == null || lngNow == null) {
        try {
          if (userId) {
            const { data } = await supabase
              .from('profiles')
              .select('last_lat,last_lng')
              .eq('id', userId)
              .maybeSingle<ProfileLocationRow>();
            const la = data?.last_lat ?? null;
            const ln = data?.last_lng ?? null;
            if (la != null && ln != null) {
              latNow = la;
              lngNow = ln;
            }
          }
        } catch {}
      }

      await fetchNearbyActivities(latNow, lngNow);
      await fetchPlacesViewport(latNow, lngNow);
  await refreshRankedOpenSessions({ coordinates: { lat: latNow, lng: lngNow } });
      
      // Get current sessions with future start times
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("sessions")
        .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name)")
        .gte("starts_at", now) // Only future sessions
        .order("starts_at", { ascending: true })
        .limit(20);
      if (error) setError(error.message);
      else setRows((data ?? []) as ActivityRow[]);
    } catch (err) {
      console.error('Home screen load error:', err);
      setError('Failed to load activities. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchNearbyActivities, fetchPlacesViewport, refreshRankedOpenSessions]);

  useEffect(() => {
    ensureBackgroundLocation().catch(() => {});
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 100 },
          (loc: Location.LocationObject) => {
            const la = Number(loc.coords.latitude.toFixed(6));
            const ln = Number(loc.coords.longitude.toFixed(6));
            fetchNearbyActivities(la, ln);
            fetchPlacesViewport(la, ln);
          }
        );
      } catch {}
    })();
    return () => { sub?.remove(); };
  }, [fetchNearbyActivities, fetchPlacesViewport]);

  // Simulate search suggestions (replace with real API)
  const searchSuggestions = activities ? activities
    .filter(activity =>
      activity.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      activity.name.toLowerCase() !== searchQuery.toLowerCase()
    )
    .slice(0, 3)
    .map(activity => activity.name) : [];

  useEffect(() => {
    if (activities) {
      const filtered = activities.filter(activity =>
        activity.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredActivities(filtered);
    }
  }, [activities, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilter = () => {
    router.push('/filter');
  };

  const handleTogglePlaceSave = useCallback(async (place: PlaceSummary) => {
    const payload = buildPlaceSavePayload(place, defaultCity.slug ?? null);
    try {
      await toggle(payload);
    } catch (err) {
      if (__DEV__) {
        console.error('[Home] Failed to toggle saved place', err);
      }
      const message = err instanceof Error ? err.message : 'Unable to update saved activities.';
      Alert.alert('Save place', message);
    }
  }, [defaultCity.slug, toggle]);

  const activityPresence = useMemo(() => {
    const idSet = new Set<string>();
    const nameSet = new Set<string>();
    (activities ?? []).forEach((activity) => {
      if (activity?.id) idSet.add(String(activity.id));
      if (activity?.name) nameSet.add(activity.name.trim().toLowerCase());
    });
    return { idSet, nameSet };
  }, [activities]);


  const activityEventCounts = useMemo(() => {
    const idMap = new Map<string, number>();
    const nameMap = new Map<string, number>();
    rows.forEach((session) => {
      const activityId = session.activities?.id != null ? String(session.activities.id) : null;
      if (activityId) {
        idMap.set(activityId, (idMap.get(activityId) ?? 0) + 1);
      }
      const activityName = typeof session.activities?.name === 'string' ? session.activities.name.trim().toLowerCase() : '';
      if (activityName) {
        nameMap.set(activityName, (nameMap.get(activityName) ?? 0) + 1);
      }
    });
    return { idMap, nameMap };
  }, [rows]);

  const getActivitySessionCount = useCallback(
    (activity: NearbyActivity): number => {
      const idKey = activity?.id ? String(activity.id) : null;
      if (idKey && activityEventCounts.idMap.has(idKey)) {
        return activityEventCounts.idMap.get(idKey) ?? 0;
      }
      const normalizedName = activity?.name?.trim().toLowerCase() ?? '';
      if (normalizedName && activityEventCounts.nameMap.has(normalizedName)) {
        return activityEventCounts.nameMap.get(normalizedName) ?? 0;
      }
      return 0;
    },
    [activityEventCounts]
  );

  const standaloneSessions = useMemo(() => {
    if (rows.length === 0) return rows;
    const hasActivityFilters = activityPresence.idSet.size > 0 || activityPresence.nameSet.size > 0;
    if (!hasActivityFilters) return rows;
    return rows.filter((session) => {
      const activityId = session.activities?.id != null ? String(session.activities.id) : null;
      if (activityId && activityPresence.idSet.has(activityId)) {
        return false;
      }
      const activityName = typeof session.activities?.name === 'string' ? session.activities.name.trim().toLowerCase() : '';
      if (activityName && activityPresence.nameSet.has(activityName)) {
        return false;
      }
      return true;
    });
  }, [rows, activityPresence]);

  const upcomingStandaloneSessions = useMemo(() => standaloneSessions.slice(0, 6), [standaloneSessions]);
  const topPlaces = useMemo(() => nearbyPlaces.slice(0, 12), [nearbyPlaces]);
  const heroSessions: FindA4thHeroSession[] = useMemo(
    () =>
      recruitingSessions
        .filter((item) => Boolean(item.session?.id))
        .map((item) => ({
          id: item.session.id,
          sportLabel: item.session.activityName ?? null,
          venueLabel: item.session.venueName ?? null,
          startsAt: item.session.startsAt ?? null,
          openSlots: item.session.openSlotMeta?.slotsCount ?? item.session.openSlots?.slotsTotal ?? null,
        })),
    [recruitingSessions],
  );
  const showRecruitingSection = lookingForPlayersFeatureEnabled && (recruitingLoading || heroSessions.length > 0);
  const showFindA4thHero = !recruitingLoading && heroSessions.length > 0;

  const handleToggleSavePayload = useCallback(async (payload: SavePayload | null) => {
    if (!payload) return;
    try {
      await toggle(payload);
    } catch (err) {
      if (__DEV__) {
        console.error('[Home] Failed to toggle saved activity', err);
      }
      const message = err instanceof Error ? err.message : 'Unable to update saved activities.';
      Alert.alert('Save activity', message);
    }
  }, [toggle]);

  const handleFindA4thHeroPress = useCallback(
    (session: FindA4thHeroSession) => {
      trackFindA4thCardTap({
        platform: 'mobile',
        surface: FIND_A_FOURTH_SURFACE,
        sessionId: session.id,
        sport: session.sportLabel ?? null,
        venue: session.venueLabel ?? null,
      });
      router.push(`/(tabs)/sessions/${session.id}`);
    },
    [router],
  );

  useEffect(() => {
    if (showFindA4thHero && heroSessions.length > 0 && !findA4thImpressionLogged.current) {
      trackFindA4thImpression({
        platform: 'mobile',
        surface: FIND_A_FOURTH_SURFACE,
        sessions: heroSessions.map((session) => ({
          sessionId: session.id,
          sport: session.sportLabel ?? null,
          venue: session.venueLabel ?? null,
        })),
      });
      findA4thImpressionLogged.current = true;
    } else if (!showFindA4thHero) {
      findA4thImpressionLogged.current = false;
    }
  }, [heroSessions, showFindA4thHero]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error) {
    return <Text style={{ padding: 16, color: "red" }}>Error: {error}</Text>;
  }

  if (loading) {
    return (
      <View style={{ padding: 12, gap: 12, backgroundColor: '#f0f0f0' }}>
        <Text style={{ padding: 16, fontSize: 16, textAlign: 'center' }}>🔄 Loading doWhat...</Text>
        {[0,1,2].map((i) => (
          <View key={i} style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
            <View style={{ height: 16, width: 120, backgroundColor: '#e5e7eb', borderRadius: 4 }} />
            <View style={{ height: 12, width: 180, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
            <View style={{ height: 12, width: 80, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
            <View style={{ height: 12, width: 220, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
          </View>
        ))}
      </View>
    );
  }

  // Fail-safe: AuthGate should prevent this, but keep a lightweight fallback.
  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Text style={{ color: '#111827', fontSize: 16, padding: 24, textAlign: 'center' }}>
          Please sign in to view nearby activities.
        </Text>
      </SafeAreaView>
    );
  }

  // New design: header + discover grid + (optional) upcoming sessions
  {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#2C3E50" />
        
        {/* Modern Header */}
        <LinearGradient
          colors={[theme.colors.brandTeal, theme.colors.brandTealDark]}
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + (isAndroid ? 6 : 12),
            paddingBottom: isAndroid ? 56 : 76,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="person" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <Brand />
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/map')}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="map" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: isAndroid ? 12 : 18 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, letterSpacing: 0.2 }}>Find your next activity</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 4 }}>Explore nearby experiences</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 20 }}>
              Browse curated activities, see who is going, and create your own events.
            </Text>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: isAndroid ? -34 : -44 }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 16,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}>
            <SearchBar
              onSearch={handleSearch}
              onFilter={handleFilter}
              suggestedSearches={searchSuggestions}
              placeholder="Search for activities..."
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => router.push('/people-filter')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(100,116,255,0.08)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}
              >
                <Ionicons name="people" size={16} color="#6366F1" />
                <Text style={{ marginLeft: 8, fontWeight: '600', color: '#3730A3' }}>Find People</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/add-event')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontWeight: '600', color: '#FFFFFF' }}>Create Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <OnboardingNavPrompt />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          )}
        >
          {topPlaces.length > 0 ? (
            <View style={{ marginTop: 28 }}>
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Popular nearby places</Text>
                <Text style={{ color: '#6B7280', marginTop: 4 }}>Quick picks straight from the Discover map.</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, columnGap: 14 }}
              >
                {topPlaces.map((place) => {
                  const appearance = resolveCategoryAppearance(place);
                  const primaryCategory = resolvePrimaryCategoryKey(place);
                  const categoryLabel = primaryCategory
                    ? formatCategoryLabel(primaryCategory)
                    : place.categories?.[0]
                      ? formatCategoryLabel(place.categories[0])
                      : 'Activity';
                  const updatedLabel = formatPlaceUpdatedLabel(place);
                  const locality = place.address ?? place.locality ?? null;
                  const placeSaved = isSaved(place.id);
                  const placeSaving = pendingIds.has(place.id);
                  return (
                    <Pressable
                      key={place.id}
                      onPress={() => router.push('/(tabs)/map')}
                      style={{
                        width: 240,
                        borderRadius: 18,
                        padding: 16,
                        backgroundColor: '#0F172A',
                        shadowColor: '#000',
                        shadowOpacity: 0.12,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 4,
                      }}
                    >
                      <SaveBadge
                        saved={placeSaved}
                        saving={placeSaving}
                        variant="dark"
                        style={{ position: 'absolute', top: 12, right: 12 }}
                        onPress={() => handleTogglePlaceSave(place)}
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            borderWidth: 1,
                            borderColor: appearance.color,
                          }}
                        >
                          <Text style={{ fontSize: 24 }}>{appearance.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '700' }}>
                            {place.name}
                          </Text>
                          <Text style={{ color: '#E2E8F0', fontSize: 13, marginTop: 4 }}>{categoryLabel}</Text>
                          {locality ? (
                            <Text numberOfLines={1} style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>
                              {locality}
                            </Text>
                          ) : null}
                          <Text style={{ color: '#CBD5E1', fontSize: 11, marginTop: locality ? 4 : 6 }}>
                            {updatedLabel}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : placesError ? (
            <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>{placesError}</Text>
            </View>
          ) : null}

          {showRecruitingSection ? (
            <View style={{ marginTop: 28 }}>
              {showFindA4thHero ? (
                <FindA4thHero
                  sessions={heroSessions}
                  onPress={handleFindA4thHeroPress}
                  title="Find a 4th player"
                  subtitle="Sessions asking for teammates, sorted for you."
                />
              ) : recruitingLoading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, columnGap: 16 }}
                >
                  {[0, 1, 2].map((key) => (
                    <View
                      key={`recruiting-skeleton-${key}`}
                      style={{
                        width: 260,
                        borderRadius: 20,
                        backgroundColor: '#FFFFFF',
                        padding: 16,
                        shadowColor: '#000',
                        shadowOpacity: 0.05,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 2,
                        gap: 10,
                      }}
                    >
                      <View style={{ height: 16, backgroundColor: '#E5E7EB', borderRadius: 8, width: 180 }} />
                      <View style={{ height: 12, backgroundColor: '#E5E7EB', borderRadius: 8, width: 120 }} />
                      <View style={{ height: 12, backgroundColor: '#E5E7EB', borderRadius: 8, width: 150 }} />
                      <View style={{ height: 36, backgroundColor: '#F1F5F9', borderRadius: 999 }} />
                    </View>
                  ))}
                </ScrollView>
              ) : recruitingError ? (
                <View style={{ paddingHorizontal: 20 }}>
                  <Text style={{ color: '#DC2626', fontSize: 13 }}>{recruitingError}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {filteredActivities.length === 0 && searchQuery ? (
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: 60,
            }}>
              <EmptyState
                icon="search"
                title="No results found"
                subtitle={`No activities found for "${searchQuery}"`}
                actionText="Clear Search"
                onAction={() => handleSearch('')}
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              {/* Section Header */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: '#1F2937',
                  marginBottom: 6,
                }}>
                  {searchQuery ? `Results for "${searchQuery}"` : 'Nearby Activities'}
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  fontWeight: '500',
                }}>
                  {searchQuery 
                    ? `${filteredActivities.length} activities found`
                    : `${activities?.length ?? 0} activities in your area`
                  }
                </Text>
              </View>
              
              {/* Activities Grid */}
              <View style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                {(searchQuery ? filteredActivities : (activities ?? [])).map((activity) => {
                  const sessionCount = getActivitySessionCount(activity);
                  const derivedCount = Math.max(sessionCount, activity.count ?? 0);
                  const visual = activityVisuals[activity.name] || defaultVisual;
                  const activityPayload = buildActivitySavePayload(activity, rows, {
                    source: 'mobile_home_activity_card',
                  });
                  const activityPayloadId = activityPayload?.id ?? null;
                  const saved = activityPayloadId ? isSaved(activityPayloadId) : false;
                  const saving = activityPayloadId ? pendingIds.has(activityPayloadId) : false;
                  return (
                    <Link
                      key={activity.id}
                      href={{ pathname: '/activities/[id]', params: { id: activity.id, name: activity.name } }}
                      asChild
                    >
                      <Pressable style={{
                        width: (screenWidth - 56) / 2, // Account for padding and gap
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 4,
                        marginBottom: 16,
                      }}>
                        <SaveBadge
                          saved={saved}
                          saving={saving}
                          disabled={!activityPayloadId}
                          variant="light"
                          style={{ position: 'absolute', top: 12, right: 12 }}
                          onPress={() => {
                            if (activityPayload) {
                              handleToggleSavePayload(activityPayload);
                            }
                          }}
                        />
                        {/* Activity Icon Container */}
                        <View style={{
                          width: 84,
                          height: 84,
                          borderRadius: 42,
                          backgroundColor: theme.colors.brandYellow,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 16,
                          ...theme.shadow.card,
                        }}>
                          <ActivityIcon name={activity.name} size={32} color="#111827" />
                        </View>
                        
                        {/* Activity Info */}
                        <Text numberOfLines={2} style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: '#1F2937',
                          textAlign: 'center',
                          lineHeight: 22,
                          marginBottom: 8,
                        }}>
                          {activity.name}
                        </Text>
                        
                        {/* Activity Count */}
                        <View style={{
                          backgroundColor: visual.color + '15',
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}>
                          <Text style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: visual.color,
                          }}>
                            Activity: {derivedCount}
                          </Text>
                        </View>
                      </Pressable>
                    </Link>
                  );
                })}
              </View>
            </View>
          )}
          {/* Upcoming sessions */}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 }}>
              Upcoming Sessions
            </Text>
            {standaloneSessions.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 16 }}>
                <Text style={{ color: '#6B7280' }}>No sessions yet. Be the first to create one!</Text>
              </View>
            ) : (
              upcomingStandaloneSessions.map((s) => (
                <View key={String(s.id)} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                  {(() => {
                    const sessionSavePayload = buildSessionSavePayload(s, {
                      source: 'mobile_home_upcoming_sessions',
                    });
                    if (!sessionSavePayload) return null;
                    const payloadId = sessionSavePayload.id;
                    const sessionSaved = payloadId ? isSaved(payloadId) : false;
                    const sessionSaving = payloadId ? pendingIds.has(payloadId) : false;
                    return (
                      <SaveBadge
                        saved={sessionSaved}
                        saving={sessionSaving}
                        disabled={!payloadId}
                        variant="light"
                        style={{ position: 'absolute', top: 12, right: 12 }}
                        onPress={() => handleToggleSavePayload(sessionSavePayload)}
                      />
                    );
                  })()}
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{s.activities?.name ?? 'Activity'}</Text>
                  <Text style={{ color: '#6B7280', marginTop: 2 }}>{s.venues?.name ?? 'Venue'}</Text>
                  <Text style={{ marginTop: 4 }}>{formatPrice(s.price_cents)}</Text>
                  <Text style={{ marginTop: 2, color: '#374151' }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
                  <SessionAttendanceBadges sessionId={s.id ?? null} />
                  <SessionAttendanceQuickActions sessionId={s.id ?? null} size="compact" style={{ marginTop: 8 }} />
                  <Link href={`/sessions/${s.id}`} asChild>
                    <Pressable style={{ marginTop: 10, padding: 10, backgroundColor: '#10B981', borderRadius: 10 }}>
                      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>View details</Text>
                    </Pressable>
                  </Link>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

export default HomeScreen;
