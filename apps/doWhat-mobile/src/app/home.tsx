import { supabase } from "../lib/supabase";
import { fetchSupabasePlacesWithinBounds } from "../lib/supabasePlaces";
import { ensureBackgroundLocation, getLastKnownBackgroundLocation } from "../lib/bg-location";
import {
  normaliseActivityName,
  formatPrice,
  formatDateRange,
  formatPlaceUpdatedLabel,
  createNearbyActivitiesFetcher,
  DEFAULT_CITY_SLUG,
  getCityConfig,
  theme,
  buildPlaceSavePayload,
  buildActivitySavePayload,
  buildSessionSavePayload,
  dedupePlaceSummaries,
  trackFindA4thCardTap,
  trackFindA4thImpression,
  fetchOverpassPlaceSummaries,
  estimateRadiusFromBounds,
  DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  type PlaceSummary,
  type PlacesViewportQuery,
  type MapActivity,
  type ActivityRow,
  type ActivityFilterPreferences,
  type SavePayload,
} from "@dowhat/shared";
import { buildWebUrl } from "../lib/web";
import {
  buildHomeActivityEventCounts,
  groupDiscoveryActivitiesForHome,
  resolveHomeActivityCardMeta,
  type HomeNearbyActivity,
} from "../lib/homeActivityCounts";
import { buildHomeDiscoveryFilters, rankPlaceSummariesForDiscovery } from "../lib/mobileDiscovery";
import * as Location from 'expo-location';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoRouter = require("expo-router");
const { Link, useFocusEffect, router } = ExpoRouter;
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, RefreshControl, TouchableOpacity, ScrollView, StatusBar, Platform, Alert } from "react-native";
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { geocodeLabelToCoords } from '../lib/geocode';

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

type NearbyActivity = HomeNearbyActivity;

type ActivityCardModel = {
  activity: NearbyActivity;
  visual: { icon: string; color: string; bgColor: string };
  badgeLabel: string | null;
  supportingLabel: string;
  payload: SavePayload | null;
  saved: boolean;
  saving: boolean;
};

type ProfileLocationRow = {
  location: string | null;
  last_lat: number | null;
  last_lng: number | null;
};

const HOME_SESSION_RADIUS_METERS = 25_000;
const HOME_TASK_TIMEOUT_MS = 8_000;
const HOME_DISCOVERY_TIMEOUT_MS = 20_000;
const ACTIVITY_LOCAL_KEY = 'activity_filters:v1';

const withTimeout = async <T,>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const BLOCKED_LABELS = new Set([
  'activity',
  'activities',
  'anywhere',
  'everywhere',
  'nearbyplace',
  'nearbyplaces',
  'nearbyvenue',
  'nearbyvenues',
  'n/a',
  'na',
  'none',
  'null',
  'placeholder',
  'place',
  'sample',
  'test',
  'unknown',
  'unnamed',
  'venue',
]);

const normalizeLabelKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9/]+/g, '');

const isHighQualityLabel = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/(.)\1{4,}/i.test(trimmed)) return false;
  if (/\b(test|dummy|sample|placeholder)\b/i.test(trimmed)) return false;

  const key = normalizeLabelKey(trimmed);
  if (!key || BLOCKED_LABELS.has(key)) return false;

  const letters = (trimmed.match(/[a-z]/gi) ?? []).length;
  if (letters < 3) return false;
  return true;
};

const isStrictNearbyActivity = (activity: MapActivity): boolean => {
  if (!isHighQualityLabel(activity?.name)) return false;
  const quality = typeof activity.quality_confidence === 'number' ? activity.quality_confidence : 0;
  const placeMatch = typeof activity.place_match_confidence === 'number' ? activity.place_match_confidence : 0;
  const rankScore = typeof activity.rank_score === 'number' ? activity.rank_score : 0;
  // Home search should avoid false negatives for niche but real venues (e.g. climbing gyms)
  // while still enforcing strict quality/place matching.
  return quality >= 0.72 && placeMatch >= 0.65 && rankScore >= 0.35;
};

const mapNearbyActivityToPlaceSummary = (activity: MapActivity, citySlug: string): PlaceSummary | null => {
  if (!Number.isFinite(activity.lat) || !Number.isFinite(activity.lng)) return null;

  const labelCandidates = [activity.place_label, activity.venue, activity.name];
  const label = labelCandidates.find((candidate) => isHighQualityLabel(candidate));
  if (!label) return null;

  const categories = Array.isArray(activity.taxonomy_categories) && activity.taxonomy_categories.length
    ? activity.taxonomy_categories.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : Array.isArray(activity.activity_types)
      ? activity.activity_types.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [];
  const tags = Array.isArray(activity.tags)
    ? activity.tags.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
  const linkedVenueId =
    activity.source === 'supabase-venues' && /^venue:/i.test(activity.id)
      ? activity.id.replace(/^venue:/i, '').trim() || null
      : null;
  const canonicalPlaceId = linkedVenueId ? null : activity.place_id ?? null;

  return {
    id: canonicalPlaceId?.trim() || activity.id,
    slug: null,
    name: label,
    lat: activity.lat,
    lng: activity.lng,
    rating: activity.rating ?? null,
    ratingCount: activity.rating_count ?? null,
    popularityScore: activity.popularity_score ?? null,
    categories,
    tags,
    address: activity.place_label ?? activity.venue ?? null,
    website: activity.website ?? null,
    city: citySlug,
    locality: null,
    region: null,
    country: null,
    postcode: null,
    aggregatedFrom: [activity.source ?? 'nearby-api'],
    attributions: [],
    metadata: {
      fallbackSource: 'nearby-api',
      rankScore: activity.rank_score ?? null,
      qualityConfidence: activity.quality_confidence ?? null,
      placeMatchConfidence: activity.place_match_confidence ?? null,
      placeId: canonicalPlaceId,
      linkedVenueId,
    },
    transient: true,
  };
};

const isHighQualityPlaceSummary = (place: PlaceSummary): boolean => {
  if (!isHighQualityLabel(place.name)) return false;
  const hasContext = Boolean(
    (place.address && place.address.trim()) ||
    (place.locality && place.locality.trim()) ||
    (Array.isArray(place.categories) && place.categories.length > 0) ||
    (Array.isArray(place.tags) && place.tags.length > 0),
  );
  return hasContext;
};

const SEARCH_ALIASES: Record<string, string[]> = {
  climbing: ['bouldering', 'rock climbing', 'climb'],
  billiards: ['pool', 'snooker'],
  poker: ['holdem', 'texas holdem', 'texas hold em'],
  roller: ['roller skating', 'rollerskating'],
};

const tokenizeSearch = (value: string): string[] =>
  value
    .trim()
    .toLowerCase()
    .split(/[\s,;|/]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2);

const expandSearchTokens = (tokens: string[]): string[] => {
  const expanded = new Set<string>(tokens);
  tokens.forEach((token) => {
    Object.entries(SEARCH_ALIASES).forEach(([canonical, aliases]) => {
      if (token === canonical || aliases.includes(token)) {
        expanded.add(canonical);
        aliases.forEach((alias) => expanded.add(alias));
      }
    });
  });
  return Array.from(expanded);
};

const scoreActivitySearchMatch = (name: string, query: string): number => {
  const normalizedName = name.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedName || !normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 120;
  if (normalizedName.startsWith(normalizedQuery)) return 90;
  if (normalizedName.includes(normalizedQuery)) return 70;

  const tokens = expandSearchTokens(tokenizeSearch(normalizedQuery));
  if (!tokens.length) return 0;

  let score = 0;
  tokens.forEach((token) => {
    if (normalizedName === token) {
      score += 40;
      return;
    }
    if (normalizedName.startsWith(token)) {
      score += 28;
      return;
    }
    if (normalizedName.includes(token)) {
      score += 18;
    }
  });
  return score;
};

const buildSearchText = (parts: Array<string | null | undefined>): string => {
  const tokens = parts
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(tokens)).join(' ');
};

const sessionMatchesHomeTimeWindow = (
  startsAt: string | null | undefined,
  timeWindow: 'any' | 'open_now' | 'morning' | 'afternoon' | 'evening' | 'late' | undefined,
) => {
  if (!timeWindow || timeWindow === 'any' || timeWindow === 'open_now') return true;
  if (!startsAt) return true;
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) return true;
  const hour = parsed.getHours();
  if (timeWindow === 'morning') return hour >= 6 && hour < 12;
  if (timeWindow === 'afternoon') return hour >= 12 && hour < 18;
  if (timeWindow === 'evening') return hour >= 18 && hour < 21;
  if (timeWindow === 'late') return hour >= 21 || hour < 6;
  return true;
};


const lookingForPlayersFeatureEnabled = !(
  process.env.EXPO_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS === "false" ||
  process.env.NEXT_PUBLIC_FEATURE_LOOKING_FOR_PLAYERS === "false"
);

const FIND_A_FOURTH_SURFACE = 'home_find_fourth';
const MAX_HOME_ACTIVITY_CARDS = 40;

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
  const [activityPreferences, setActivityPreferences] = useState<ActivityFilterPreferences>(
    DEFAULT_ACTIVITY_FILTER_PREFERENCES,
  );
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
  const nearbyFetcher = useMemo(
    () =>
      createNearbyActivitiesFetcher({
        buildUrl: () => buildWebUrl('/api/nearby'),
        includeCredentials: true,
        timeoutMs: HOME_DISCOVERY_TIMEOUT_MS,
      }),
    [],
  );

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

    const fetchNearbyFromSupabase = useCallback(async (latNow: number, lngNow: number, prefs?: ActivityFilterPreferences) => {
      const radiusMeters = Math.max(1000, Math.min(50_000, (prefs?.radius ?? 2.5) * 1000));
      const queryFilters = buildHomeDiscoveryFilters(prefs);
      const selectedCategories = new Set((prefs?.categories ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
      const minPriceCents = prefs ? Math.max(0, Math.round(prefs.priceRange[0] * 100)) : 0;
      const maxPriceCents = prefs && prefs.priceRange[1] >= DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1]
        ? Number.POSITIVE_INFINITY
        : prefs
          ? Math.max(minPriceCents, Math.round(prefs.priceRange[1] * 100))
          : Number.POSITIVE_INFINITY;
      const { data, error } = await supabase
        .from('sessions')
        .select(
          `id, activity_id, price_cents, starts_at,
             activities!inner(id, name, activity_types),
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
        if (!Number.isFinite(distance) || distance > radiusMeters) return acc;
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
        if (!isHighQualityLabel(name)) return acc;
        const activityTypes = Array.isArray(activities?.activity_types)
          ? activities.activity_types.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
          : [];
        if (selectedCategories.size > 0) {
          const normalizedTypes = activityTypes.map((entry) => entry.trim().toLowerCase());
          if (!normalizedTypes.some((entry) => selectedCategories.has(entry))) {
            return acc;
          }
        }
        const priceCents =
          typeof row.price_cents === 'number'
            ? row.price_cents
            : row.price_cents != null && row.price_cents !== ''
              ? Number(row.price_cents)
              : null;
        if (
          prefs &&
          (
            prefs.priceRange[0] !== DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[0]
            || prefs.priceRange[1] !== DEFAULT_ACTIVITY_FILTER_PREFERENCES.priceRange[1]
          ) &&
          typeof priceCents === 'number' &&
          Number.isFinite(priceCents) &&
          (priceCents < minPriceCents || priceCents > maxPriceCents)
        ) {
          return acc;
        }
        const startsAt = typeof row.starts_at === 'string' ? row.starts_at : null;
        if (!sessionMatchesHomeTimeWindow(startsAt, queryFilters?.timeWindow)) {
          return acc;
        }
        const searchText = buildSearchText([name, ...activityTypes]);
        const groupKey = normaliseActivityName(name);
        const existing = acc[groupKey];
        if (existing) {
          existing.count += 1;
          existing.searchText = buildSearchText([existing.searchText, searchText]);
        } else {
          acc[groupKey] = { id: groupKey, name, count: 1, searchText };
        }
        return acc;
      }, {});
      return Object.values(grouped).sort((a, b) => b.count - a.count);
    }, []);

  const fetchNearbyFromApi = useCallback(async (
    latNow: number,
    lngNow: number,
    prefs?: ActivityFilterPreferences,
    options?: { refresh?: boolean },
  ): Promise<NearbyActivity[]> => {
    const radiusMeters = Math.max(1000, Math.min(50_000, (prefs?.radius ?? 2.5) * 1000));
    const response = await nearbyFetcher({
      center: { lat: latNow, lng: lngNow },
      radiusMeters,
      limit: 300,
      filters: buildHomeDiscoveryFilters(prefs),
      refresh: options?.refresh,
    });

    return groupDiscoveryActivitiesForHome(
      response.activities.filter((activity) => isStrictNearbyActivity(activity)),
      buildSearchText,
    );
  }, [nearbyFetcher]);

  const fetchNearbyActivities = useCallback(async (
    latNow: number | null,
    lngNow: number | null,
    prefs?: ActivityFilterPreferences,
    options?: { refresh?: boolean },
  ) => {
    if (latNow == null || lngNow == null) {
      setActivities([]);
      return;
    }
    try {
      const grouped = await fetchNearbyFromApi(latNow, lngNow, prefs, options);
      if (grouped.length > 0) {
        setActivities(grouped);
      } else {
        const fallback = await fetchNearbyFromSupabase(latNow, lngNow, prefs);
        setActivities(fallback.filter((item) => isHighQualityLabel(item.name)));
      }
      nearbyApiFailureLogged.current = false;
    } catch (error) {
      if (__DEV__ && !nearbyApiFailureLogged.current) {
        nearbyApiFailureLogged.current = true;
        console.info('[Home] Nearby Supabase query failed', error);
      }
      try {
        const fallback = await fetchNearbyFromSupabase(latNow, lngNow, prefs);
        setActivities(fallback.filter((item) => isHighQualityLabel(item.name)));
      } catch {
        setActivities([]);
      }
    }
  }, [fetchNearbyFromApi, fetchNearbyFromSupabase]);

  const fetchPlacesViewport = useCallback(
    async (latNow: number | null, lngNow: number | null, options?: { refresh?: boolean }) => {
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
      const fallbackRadiusMeters = estimateRadiusFromBounds(bounds);

      try {
        const nearby = await nearbyFetcher({
          center: { lat: fallbackCenterLat, lng: fallbackCenterLng },
          radiusMeters: fallbackRadiusMeters,
          limit: 120,
          refresh: options?.refresh,
        });

        const strictNearbyPlaces = rankPlaceSummariesForDiscovery(
          dedupePlaceSummaries(
            nearby.activities
            .filter((activity) => isStrictNearbyActivity(activity))
            .map((activity) => mapNearbyActivityToPlaceSummary(activity, city.slug))
            .filter((entry): entry is PlaceSummary => Boolean(entry))
            .filter((place) => isHighQualityPlaceSummary(place)),
          ),
          { center: { lat: fallbackCenterLat, lng: fallbackCenterLng } },
        );

        if (strictNearbyPlaces.length > 0) {
          setNearbyPlaces(strictNearbyPlaces.slice(0, 80));
          setPlacesError(null);
          placesFetchFailureLogged.current = false;
          return;
        }
      } catch (nearbyError) {
        if (__DEV__ && !placesFetchFailureLogged.current) {
          console.warn('[Home] Nearby API places fetch failed', nearbyError);
        }
      }

      try {
        const supabasePlaces = await fetchSupabasePlacesWithinBounds({
          bounds,
          citySlug: city.slug,
          limit: 80,
        });
        setNearbyPlaces(
          rankPlaceSummariesForDiscovery(
            dedupePlaceSummaries((supabasePlaces ?? []).filter((place) => isHighQualityPlaceSummary(place))),
            { center: { lat: fallbackCenterLat, lng: fallbackCenterLng } },
          ),
        );
        setPlacesError(null);
        placesFetchFailureLogged.current = false;
        return;
      } catch (err) {
        primaryError = err;
        if (__DEV__ && !placesFetchFailureLogged.current) {
          placesFetchFailureLogged.current = true;
          console.warn('[Home] Supabase places fetch failed', err);
        }
      }

      try {
        const fallbackPlaces = await fetchOverpassPlaceSummaries({
          lat: fallbackCenterLat,
          lng: fallbackCenterLng,
          radiusMeters: fallbackRadiusMeters,
          limit: 30,
        });
        const strictFallbackPlaces = fallbackPlaces.filter((place) => isHighQualityPlaceSummary(place));
        if (strictFallbackPlaces.length) {
          setNearbyPlaces(
            rankPlaceSummariesForDiscovery(dedupePlaceSummaries(strictFallbackPlaces), {
              center: { lat: fallbackCenterLat, lng: fallbackCenterLng },
            }),
          );
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
    [defaultCity, nearbyFetcher],
  );

  const fetchUpcomingSessions = useCallback(async (latNow: number, lngNow: number) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("sessions")
      .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name,lat,lng)")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(120);

    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }

    const strictRows = ((data ?? []) as ActivityRow[]).filter((row) => {
      const activityName = row.activities?.name;
      if (!isHighQualityLabel(activityName)) return false;
      const venueName = row.venues?.name;
      if (typeof venueName === 'string' && venueName.trim() && !isHighQualityLabel(venueName)) {
        return false;
      }

      const venueRecord = row.venues as unknown as { lat?: unknown; lng?: unknown } | null;
      const venueLatRaw = venueRecord?.lat;
      const venueLngRaw = venueRecord?.lng;
      const venueLat =
        typeof venueLatRaw === 'number'
          ? venueLatRaw
          : typeof venueLatRaw === 'string' && venueLatRaw.trim()
            ? Number(venueLatRaw)
            : NaN;
      const venueLng =
        typeof venueLngRaw === 'number'
          ? venueLngRaw
          : typeof venueLngRaw === 'string' && venueLngRaw.trim()
            ? Number(venueLngRaw)
            : NaN;

      if (!Number.isFinite(venueLat) || !Number.isFinite(venueLng)) {
        return false;
      }
      const distance = haversineMeters(latNow, lngNow, venueLat, venueLng);
      if (!Number.isFinite(distance) || distance > HOME_SESSION_RADIUS_METERS) {
        return false;
      }
      return true;
    });

    setRows(strictRows.slice(0, 20));
  }, []);

  const load = useCallback(async (options?: { refresh?: boolean }) => {
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getSession();
      setSession(auth.session ?? null);
      const userId = auth.session?.user?.id ?? null;
      let resolvedPrefs = DEFAULT_ACTIVITY_FILTER_PREFERENCES;

      const loadLocalPreferences = async (): Promise<ActivityFilterPreferences | null> => {
        try {
          const raw = await AsyncStorage.getItem(ACTIVITY_LOCAL_KEY);
          if (!raw) return null;
          return normaliseActivityFilterPreferences(JSON.parse(raw) as ActivityFilterPreferences);
        } catch {
          return null;
        }
      };

      if (userId) {
        try {
          const remotePrefs = await loadUserPreference<ActivityFilterPreferences>(supabase, userId, 'activity_filters');
          if (remotePrefs) {
            resolvedPrefs = normaliseActivityFilterPreferences(remotePrefs);
          }
        } catch {
          // fall through to local preferences
        }
      }

      if (resolvedPrefs === DEFAULT_ACTIVITY_FILTER_PREFERENCES) {
        const localPrefs = await loadLocalPreferences();
        if (localPrefs) {
          resolvedPrefs = localPrefs;
        }
      }
      setActivityPreferences(resolvedPrefs);

      let latNow: number | null = null;
      let lngNow: number | null = null;
      let profileLocationLabel: string | null = null;

      if (userId) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('location,last_lat,last_lng')
            .eq('id', userId)
            .maybeSingle<ProfileLocationRow>();

          const storedLat = typeof data?.last_lat === 'number' && Number.isFinite(data.last_lat)
            ? Number(data.last_lat.toFixed(6))
            : null;
          const storedLng = typeof data?.last_lng === 'number' && Number.isFinite(data.last_lng)
            ? Number(data.last_lng.toFixed(6))
            : null;
          profileLocationLabel = typeof data?.location === 'string' && data.location.trim()
            ? data.location.trim()
            : null;

          if (profileLocationLabel) {
            const geocoded = await geocodeLabelToCoords(profileLocationLabel);
            if (geocoded) {
              latNow = Number(geocoded.lat.toFixed(6));
              lngNow = Number(geocoded.lng.toFixed(6));
              const shouldSyncCoords =
                storedLat == null ||
                storedLng == null ||
                Math.abs(storedLat - latNow) > 0.001 ||
                Math.abs(storedLng - lngNow) > 0.001;
              if (shouldSyncCoords) {
                void (async () => {
                  try {
                    await supabase
                      .from('profiles')
                      .update({ last_lat: latNow, last_lng: lngNow })
                      .eq('id', userId);
                  } catch {
                    // Best-effort sync only.
                  }
                })();
              }
            }
          }

          if ((latNow == null || lngNow == null) && storedLat != null && storedLng != null) {
            latNow = storedLat;
            lngNow = storedLng;
          }
        } catch {}
      }

      if (latNow == null || lngNow == null) {
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
      }
      if (latNow == null || lngNow == null) {
        try {
          const cached = await getLastKnownBackgroundLocation();
          if (cached) {
            latNow = cached.lat;
            lngNow = cached.lng;
          }
        } catch {}
      }

      if (__DEV__ && profileLocationLabel && latNow != null && lngNow != null) {
        console.info('[Home] Using profile-selected location for discovery', {
          label: profileLocationLabel,
          lat: latNow,
          lng: lngNow,
        });
      }

      if (latNow == null || lngNow == null) {
        const cityFallback = defaultCity.center;
        latNow = cityFallback.lat;
        lngNow = cityFallback.lng;
      }

      const runLoadTask = async (
        label: string,
        task: () => Promise<void>,
        onFailure?: () => void,
        timeoutMs = HOME_TASK_TIMEOUT_MS,
      ) => {
        try {
          await withTimeout(task(), timeoutMs, label);
        } catch (taskError) {
          if (__DEV__) {
            console.warn(`[Home] ${label} failed`, taskError);
          }
          onFailure?.();
        }
      };

      await Promise.allSettled([
        runLoadTask('nearby activities', () => fetchNearbyActivities(latNow, lngNow, resolvedPrefs, options), () => {
          setActivities([]);
        }, HOME_DISCOVERY_TIMEOUT_MS),
        runLoadTask('nearby places', () => fetchPlacesViewport(latNow, lngNow, options), () => {
          setNearbyPlaces([]);
          setPlacesError('Unable to load nearby places right now.');
        }, HOME_DISCOVERY_TIMEOUT_MS),
        runLoadTask('open sessions', () => refreshRankedOpenSessions({ coordinates: { lat: latNow, lng: lngNow } })),
        runLoadTask('upcoming sessions', () => fetchUpcomingSessions(latNow, lngNow), () => {
          setRows([]);
        }),
      ]);
    } catch (err) {
      console.error('Home screen load error:', err);
      setError('Failed to load activities. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [defaultCity.center, fetchNearbyActivities, fetchPlacesViewport, fetchUpcomingSessions, refreshRankedOpenSessions]);

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
            fetchNearbyActivities(la, ln, activityPreferences);
            fetchPlacesViewport(la, ln);
          }
        );
      } catch {}
    })();
    return () => { sub?.remove(); };
  }, [activityPreferences, fetchNearbyActivities, fetchPlacesViewport]);

  const rankedSearchActivities = useMemo(() => {
    const source = activities ?? [];
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return source;

    return source
      .map((activity) => ({
        activity,
        score: scoreActivitySearchMatch(
          `${activity.name} ${(activity.searchText ?? '').trim()}`,
          trimmedQuery,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.activity.count !== a.activity.count) return b.activity.count - a.activity.count;
        return a.activity.name.localeCompare(b.activity.name);
      })
      .map((entry) => entry.activity);
  }, [activities, searchQuery]);

  // Derive search suggestions from ranked nearby activity names.
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) {
      return (activities ?? []).slice(0, 3).map((activity) => activity.name);
    }
    return rankedSearchActivities
      .filter((activity) => activity.name.trim().toLowerCase() !== searchQuery.trim().toLowerCase())
      .slice(0, 3)
      .map((activity) => activity.name);
  }, [activities, rankedSearchActivities, searchQuery]);

  const filteredActivities = useMemo(
    () => (searchQuery.trim() ? rankedSearchActivities : activities ?? []),
    [activities, rankedSearchActivities, searchQuery],
  );

  const activitiesToDisplay = useMemo(() => {
    const source = searchQuery.trim() ? filteredActivities : (activities ?? []);
    return source.slice(0, MAX_HOME_ACTIVITY_CARDS);
  }, [activities, filteredActivities, searchQuery]);

  const hiddenActivitiesCount = useMemo(() => {
    const total = (searchQuery.trim() ? filteredActivities : (activities ?? [])).length;
    return Math.max(0, total - activitiesToDisplay.length);
  }, [activities, activitiesToDisplay.length, filteredActivities, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
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


  const activityEventCounts = useMemo(() => buildHomeActivityEventCounts(rows), [rows]);

  const activityCardModels = useMemo<ActivityCardModel[]>(() => {
    return activitiesToDisplay.map((activity) => {
      const { badgeLabel, supportingLabel } = resolveHomeActivityCardMeta(activity, activityEventCounts);
      const visual = activityVisuals[activity.name] || defaultVisual;
      const payload = buildActivitySavePayload(activity, rows, {
        source: 'mobile_home_activity_card',
      });
      const payloadId = payload?.id ?? null;
      const saved = payloadId ? isSaved(payloadId) : false;
      const saving = payloadId ? pendingIds.has(payloadId) : false;
      return {
        activity,
        visual,
        badgeLabel,
        supportingLabel,
        payload,
        saved,
        saving,
      };
    });
  }, [activitiesToDisplay, activityEventCounts, isSaved, pendingIds, rows]);

  const activityCardRows = useMemo(() => {
    const rowsGrouped: ActivityCardModel[][] = [];
    for (let i = 0; i < activityCardModels.length; i += 2) {
      rowsGrouped.push(activityCardModels.slice(i, i + 2));
    }
    return rowsGrouped;
  }, [activityCardModels]);

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
    await load({ refresh: true });
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
              Browse curated activities, see who is going, and create your own sessions.
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
              value={searchQuery}
              onSearch={handleSearch}
              filterHref="/filter"
              suggestedSearches={searchSuggestions}
              placeholder="Search for activities..."
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => router.push('/people-filter')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(100,116,255,0.08)',
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: 'rgba(99,102,241,0.2)',
                }}
              >
                <Ionicons name="people" size={16} color="#6366F1" />
                <Text style={{ marginLeft: 8, fontWeight: '700', color: '#3730A3' }}>Find People</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/add-event')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#10B981',
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontWeight: '700', color: '#FFFFFF' }}>Create session</Text>
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
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, paddingRight: 6 }}
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
                        width: 252,
                        marginRight: 14,
                        borderRadius: 18,
                        padding: 16,
                        backgroundColor: '#0F172A',
                        shadowColor: '#000',
                        shadowOpacity: 0.12,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 4,
                        minHeight: 148,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
                        <SaveBadge
                          saved={placeSaved}
                          saving={placeSaving}
                          variant="dark"
                          onPress={() => handleTogglePlaceSave(place)}
                        />
                      </View>
                      <View style={{ marginTop: 12 }}>
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
                    ? `${(searchQuery.trim() ? filteredActivities : activities ?? []).length} activities found`
                    : `${activities?.length ?? 0} activities in your area`
                  }
                </Text>
                {hiddenActivitiesCount > 0 ? (
                  <Text style={{ marginTop: 6, color: '#64748B', fontSize: 12 }}>
                    Showing top {activitiesToDisplay.length} results for faster browsing.
                  </Text>
                ) : null}
              </View>
              
              {/* Activities Grid */}
              <View style={{
                gap: 14,
              }}>
                {activityCardRows.map((row, rowIndex) => (
                  <View
                    key={`activity-row-${rowIndex}`}
                    style={{ flexDirection: 'row', gap: 14 }}
                  >
                    {row.map(({ activity, visual, badgeLabel, supportingLabel, payload, saved, saving }) => (
                      <Link
                        key={activity.id}
                        href={{ pathname: '/activities/[id]', params: { id: activity.id, name: activity.name } }}
                        asChild
                      >
                        <Pressable
                          style={{
                            flex: 1,
                            minHeight: 228,
                            backgroundColor: '#FFFFFF',
                            borderRadius: 20,
                            padding: 16,
                            shadowColor: '#000',
                            shadowOpacity: 0.08,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 4,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View
                              style={{
                                backgroundColor: '#F8FAFC',
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                              }}
                            >
                              <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700' }}>Nearby</Text>
                            </View>
                            <SaveBadge
                              saved={saved}
                              saving={saving}
                              disabled={!payload?.id}
                              variant="light"
                              onPress={() => {
                                if (payload) {
                                  handleToggleSavePayload(payload);
                                }
                              }}
                            />
                          </View>

                          <View style={{ alignItems: 'center', marginTop: 12 }}>
                            <View style={{
                              width: 78,
                              height: 78,
                              borderRadius: 39,
                              backgroundColor: theme.colors.brandYellow,
                              alignItems: 'center',
                              justifyContent: 'center',
                              ...theme.shadow.card,
                            }}>
                              <ActivityIcon name={activity.name} size={30} color="#111827" />
                            </View>
                          </View>

                          <Text numberOfLines={2} style={{
                            fontSize: 16,
                            fontWeight: '700',
                            color: '#1F2937',
                            textAlign: 'center',
                            lineHeight: 21,
                            marginTop: 12,
                            minHeight: 42,
                          }}>
                            {activity.name}
                          </Text>

                          {badgeLabel ? (
                            <View style={{
                              marginTop: 10,
                              alignSelf: 'center',
                              backgroundColor: visual.color + '15',
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                            }}>
                              <Text style={{
                                fontSize: 12,
                                fontWeight: '700',
                                color: visual.color,
                              }}>
                                {badgeLabel}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={{ marginTop: badgeLabel ? 8 : 14, textAlign: 'center', color: '#64748B', fontSize: 12 }}>
                            {supportingLabel}
                          </Text>
                        </Pressable>
                      </Link>
                    ))}
                    {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                  </View>
                ))}
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
