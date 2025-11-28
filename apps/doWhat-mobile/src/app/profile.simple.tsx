// Simplified mobile profile screen with dynamic (lazy) avatar picking.
// Avatar URL text input removed; user taps avatar to choose a photo.
// Uses dynamic import for expo-image-picker so bundler won't fail if the
// native module is temporarily unavailable; shows a graceful error instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ElementRef } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, RefreshControl, Modal, ActivityIndicator, Linking, Platform, ActionSheetIOS, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
import * as Location from 'expo-location';
import { theme } from '@dowhat/shared';
import type { BadgeStatus } from '@dowhat/shared';
import { supabase } from '../lib/supabase';
import { createWebUrl } from '../lib/web';
import { emitProfileLocationUpdated } from '../lib/events';
import { BadgesList, MobileBadgeItem } from '../components/BadgesList';

// Shape of the profiles table (only fields we care about in this screen)
type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  bio?: string | null;
  location?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  updated_at?: string | null;
  personality_traits?: string[] | null;
};

type ProfileUpdatePayload = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string;
  instagram?: string | null;
  whatsapp?: string | null;
  bio?: string | null;
  location?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
};

type BadgeMeta = {
  id: string;
  name: string;
  description?: string | null;
  category?: string;
};

type OwnedBadge = {
  id?: string;
  badge_id: string;
  status: BadgeStatus;
  endorsements: number;
  badges: BadgeMeta | null;
};

type CatalogBadgeEntry = {
  catalog: BadgeMeta;
  owned: OwnedBadge | null;
};

type ImagePickerModule = typeof import('expo-image-picker');
type ImagePickerOptions = import('expo-image-picker').ImagePickerOptions;
type ExtendedImagePickerOptions = ImagePickerOptions & { copyToCacheDirectory?: boolean };
type PressableHandle = ElementRef<typeof Pressable>;
type WebFile = (File | Blob) & { name?: string };

type FileListLike = {
  length: number;
  [index: number]: WebFile;
};

type DragEventLike = {
  preventDefault: () => void;
  dataTransfer?: {
    files?: FileListLike | null;
  } | null;
};

type HtmlElementLike = {
  addEventListener: (type: string, listener: (event: DragEventLike) => void) => void;
  removeEventListener: (type: string, listener: (event: DragEventLike) => void) => void;
};

type ProfileCachePayload = {
  id: string;
  full_name: string;
  avatar_url: string;
  instagram: string;
  whatsapp: string;
  bio: string;
  location: string;
  supportsInstagram: boolean;
  supportsWhatsapp: boolean;
  supportsBio: boolean;
  supportsLocation: boolean;
  supportsTraits: boolean;
  personalityTraits: string[];
  last_lat: number | null;
  last_lng: number | null;
  updated_at?: string | null;
};

type LocationSuggestion = {
  id: string;
  label: string;
  description?: string | null;
  lat: number;
  lng: number;
};

const MAX_LOCATION_SUGGESTIONS = 5;
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const GEOCODE_USER_AGENT = `doWhat-mobile/1.0 (${process.env.EXPO_PUBLIC_GEOCODE_EMAIL || 'contact@dowhat.app'})`;
const MAX_PROFILE_TRAITS = 5;

const normaliseProfileTrait = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  if (!/^[a-zA-Z][-a-zA-Z\s]+$/.test(trimmed)) return null;
  return trimmed
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const sanitizeProfileTraitList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const normalised = normaliseProfileTrait(raw);
    if (!normalised) continue;
    const key = normalised.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalised);
    if (result.length >= MAX_PROFILE_TRAITS) break;
  }
  return result;
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const coerceLabel = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const toLocationSuggestion = (
  input: Record<string, unknown> | null | undefined,
  fallbackLabel?: string | null,
  idSuffix = '',
): LocationSuggestion | null => {
  if (!input) return null;
  if (typeof input !== 'object') return null;
  const rawLat =
    coerceNumber(input['lat']) ??
    coerceNumber(input['latitude']) ??
    coerceNumber(input['y']);
  const rawLng =
    coerceNumber(input['lng']) ??
    coerceNumber(input['lon']) ??
    coerceNumber(input['longitude']) ??
    coerceNumber(input['x']);
  if (rawLat == null || rawLng == null) return null;

  const label =
    coerceLabel(input['label']) ??
    coerceLabel(input['name']) ??
    coerceLabel(fallbackLabel) ??
    coerceLabel(input['display_name']);
  if (!label) return null;

  const description = (() => {
    const explicitDescription = coerceLabel(input['description']);
    if (explicitDescription && explicitDescription !== label) return explicitDescription;
    const displayName = coerceLabel(input['display_name']);
    if (displayName && displayName !== label) return displayName;
    return null;
  })();

  const lat = Number(rawLat.toFixed(6));
  const lng = Number(rawLng.toFixed(6));
  const identifier = `${lat},${lng}${idSuffix ? `-${idSuffix}` : ''}`;

  return {
    id: identifier,
    label,
    description,
    lat,
    lng,
  };
};

const dedupeSuggestions = (list: LocationSuggestion[]): LocationSuggestion[] => {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = `${item.label.toLowerCase()}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchGeocodeSuggestionsFromBackend = async (
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> => {
  const url = createWebUrl(`/api/geocode?q=${encodeURIComponent(query)}&limit=${limit}`);
  const res = await fetch(url.toString(), { signal, credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Geocode backend request failed (${res.status})`);
  }
  const payload = await res.json() as {
    label?: string;
    lat?: number;
    lng?: number;
    results?: Array<{ label?: string; description?: string | null; lat?: number; lng?: number }>;
  };
  const suggestions: LocationSuggestion[] = [];
  if (Array.isArray(payload.results)) {
    payload.results.forEach((entry, index) => {
      const suggestion = toLocationSuggestion(entry, payload.label, `backend-${index}`);
      if (suggestion) suggestions.push(suggestion);
    });
  }
  const primary = toLocationSuggestion(payload, payload.label, 'backend-primary');
  if (primary) suggestions.unshift(primary);
  return dedupeSuggestions(suggestions).slice(0, limit);
};

const fetchGeocodeSuggestionsFromNominatim = async (
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> => {
  const url = new URL(`${NOMINATIM_BASE_URL}/search`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), {
    signal,
    headers: {
      'User-Agent': GEOCODE_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim request failed (${res.status})`);
  }
  const payload = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string; country?: string };
  }>;
  const suggestions: LocationSuggestion[] = [];
  (payload ?? []).forEach((entry, index) => {
    const addr = entry.address ?? {};
    const locality = addr.city || addr.town || addr.village || addr.hamlet || null;
    const parts = [locality, addr.state, addr.country].filter(Boolean).slice(0, 3);
    const label = parts.length ? parts.join(', ') : entry.display_name || query;
    const suggestion = toLocationSuggestion({
      label,
      description: entry.display_name || null,
      lat: entry.lat,
      lng: entry.lon,
    }, label, `nominatim-${index}`);
    if (suggestion) suggestions.push(suggestion);
  });
  return dedupeSuggestions(suggestions).slice(0, limit);
};

const fetchGeocodeSuggestions = async (
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> => {
  try {
    const backend = await fetchGeocodeSuggestionsFromBackend(query, limit, signal);
    if (backend.length) return backend;
  } catch (error) {
    if (signal?.aborted) return [];
    console.info('[ProfileSimple] backend geocode suggestions failed', error);
  }
  try {
    return await fetchGeocodeSuggestionsFromNominatim(query, limit, signal);
  } catch (error) {
    if (signal?.aborted) return [];
    console.info('[ProfileSimple] nominatim geocode suggestions failed', error);
    return [];
  }
};

const resolveForwardGeocode = async (query: string, signal?: AbortSignal): Promise<LocationSuggestion | null> => {
  const suggestions = await fetchGeocodeSuggestions(query, 1, signal);
  return suggestions[0] ?? null;
};

const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  const backendUrl = createWebUrl(`/api/geocode?lat=${lat}&lng=${lng}`);
  try {
    const res = await fetch(backendUrl.toString(), { credentials: 'include' });
    if (res.ok) {
      const payload = await res.json() as { label?: string };
      if (typeof payload?.label === 'string' && payload.label.trim()) {
        return payload.label.trim();
      }
    }
  } catch (error) {
    console.info('[ProfileSimple] reverse geocode backend failed', error);
  }

  try {
    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': GEOCODE_USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
    const payload = await res.json() as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string; country?: string };
    };
    const addr = payload.address ?? {};
    const locality = addr.city || addr.town || addr.village || addr.hamlet || null;
    const parts = [locality, addr.state, addr.country].filter(Boolean).slice(0, 3);
    const label = parts.length ? parts.join(', ') : payload.display_name || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    return label;
  } catch (error) {
    console.info('[ProfileSimple] reverse geocode nominatim failed', error);
    return null;
  }
};

const profileCacheKey = (uid: string) => `profile_simple_cache_v1_${uid}`;
type AvatarSource = 'camera' | 'library';
let eagerImagePicker: ImagePickerModule | null = null;
try {
  // Ensure the module is eagerly bundled when available (e.g., in dev clients)
  eagerImagePicker = require('expo-image-picker');
} catch {
  eagerImagePicker = null;
}

const BADGE_STATUS_VALUES: readonly BadgeStatus[] = ['unverified', 'verified', 'expired'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const describeError = (error: unknown, fallback = 'Something went wrong'): string => {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      const serialised = JSON.stringify(error);
      if (serialised && serialised !== '{}') return serialised;
    } catch {/* ignore JSON issues */}
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

const chooseAvatarSource = async (): Promise<AvatarSource | null> => {
  if (Platform.OS === 'ios') {
    return await new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Update photo',
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
          userInterfaceStyle: 'light',
        },
        (index) => {
          if (index === 1) resolve('camera');
          else if (index === 2) resolve('library');
          else resolve(null);
        },
      );
    });
  }

  return await new Promise((resolve) => {
    Alert.alert('Update photo', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Choose from library', onPress: () => resolve('library') },
    ]);
  });
};

const requestPickerPermission = async (picker: ImagePickerModule, source: AvatarSource): Promise<boolean> => {
  try {
    if (source === 'library') {
      if (typeof picker.requestMediaLibraryPermissionsAsync === 'function') {
        const perm = await picker.requestMediaLibraryPermissionsAsync();
        return perm?.status === 'granted';
      }
      if ('requestCameraRollPermissionsAsync' in picker) {
        const fn = (picker as ImagePickerModule & { requestCameraRollPermissionsAsync?: () => Promise<{ status: string }> }).requestCameraRollPermissionsAsync;
        if (typeof fn === 'function') {
          const perm = await fn();
          return perm?.status === 'granted';
        }
      }
    } else {
      if (typeof picker.requestCameraPermissionsAsync === 'function') {
        const perm = await picker.requestCameraPermissionsAsync();
        return perm?.status === 'granted';
      }
      if ('requestCameraPermissionsAsync' in picker === false) {
        console.warn('[ProfileSimple] Camera permission helper missing on expo-image-picker');
      }
    }
  } catch (permErr) {
    console.warn('[ProfileSimple] Permission request threw', permErr);
  }
  return false;
};

const launchPicker = async (picker: ImagePickerModule, source: AvatarSource) => {
  const presentationStyle = picker.UIImagePickerPresentationStyle?.FULL_SCREEN;
  const baseOptions: ExtendedImagePickerOptions = {
    allowsEditing: true,
    aspect: [1, 1] as [number, number],
    quality: 0.8,
    copyToCacheDirectory: true,
  };
  if (source === 'library') {
    if (typeof picker.launchImageLibraryAsync !== 'function') {
      throw new Error('Image picker native module missing. Rebuild dev client after adding expo-image-picker.');
    }
    const options: ExtendedImagePickerOptions = {
      ...baseOptions,
      mediaTypes: picker.MediaTypeOptions?.Images ?? undefined,
    };
    if (presentationStyle) {
      options.presentationStyle = presentationStyle;
    }
    return picker.launchImageLibraryAsync(options);
  }
  if (typeof picker.launchCameraAsync !== 'function') {
    throw new Error('Camera picker not available on this build.');
  }
  const cameraOptions: ExtendedImagePickerOptions = {
    ...baseOptions,
    mediaTypes: picker.MediaTypeOptions?.Images ?? undefined,
  };
  if (presentationStyle) {
    cameraOptions.presentationStyle = presentationStyle;
  }
  return picker.launchCameraAsync(cameraOptions);
};

const toBadgeMeta = (raw: unknown): BadgeMeta | null => {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  const name = typeof raw.name === 'string' && raw.name ? raw.name : id;
  const description =
    raw.description == null
      ? null
      : typeof raw.description === 'string'
        ? raw.description
        : String(raw.description);
  const category = typeof raw.category === 'string' ? raw.category : undefined;
  return { id, name, description, category };
};

const toOwnedBadge = (raw: unknown): OwnedBadge | null => {
  if (!isRecord(raw)) return null;
  const badgeId = typeof raw.badge_id === 'string' && raw.badge_id ? raw.badge_id : null;
  if (!badgeId) return null;
  const statusRaw = typeof raw.status === 'string' ? raw.status : null;
  const status = BADGE_STATUS_VALUES.includes(statusRaw as BadgeStatus) ? (statusRaw as BadgeStatus) : 'unverified';
  const endorsements = typeof raw.endorsements === 'number' ? raw.endorsements : 0;
  const badges = toBadgeMeta(raw.badges);
  const id = typeof raw.id === 'string' && raw.id ? raw.id : undefined;
  return { id, badge_id: badgeId, status, endorsements, badges };
};

const parseOwnedBadges = (raw: unknown): OwnedBadge[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toOwnedBadge)
    .filter((badge): badge is OwnedBadge => Boolean(badge));
};

const parseCatalogBadges = (raw: unknown): CatalogBadgeEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): CatalogBadgeEntry | null => {
      if (isRecord(item) && 'catalog' in item) {
        const catalog = toBadgeMeta(item.catalog);
        if (!catalog) return null;
        const owned = 'owned' in item ? toOwnedBadge(item.owned) : null;
        return { catalog, owned };
      }
      const catalog = toBadgeMeta(item);
      if (!catalog) return null;
      return { catalog, owned: null };
    })
    .filter((entry): entry is CatalogBadgeEntry => Boolean(entry));
};

const ownedToMobileBadge = (badge: OwnedBadge, fallback?: BadgeMeta): MobileBadgeItem => ({
  id: badge.id,
  badge_id: badge.badge_id,
  status: badge.status,
  endorsements: badge.endorsements,
  locked: false,
  badges: badge.badges ?? fallback ?? null,
});

export default function ProfileSimple() {
  console.log('[ProfileSimple] Mounted');
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [bio, setBio] = useState('');
  const [personalityTraits, setPersonalityTraits] = useState<string[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [profileLat, setProfileLat] = useState<number | null>(null);
  const [profileLng, setProfileLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<OwnedBadge[]>([]);
  const [catalogBadges, setCatalogBadges] = useState<CatalogBadgeEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftFullName, setDraftFullName] = useState('');
  // Draft state excludes avatar now (avatar picked directly, saves immediately)
  const [draftInstagram, setDraftInstagram] = useState('');
  const [draftWhatsapp, setDraftWhatsapp] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [draftLocationSelection, setDraftLocationSelection] = useState<LocationSuggestion | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  const locationSuggestionControllerRef = useRef<AbortController | null>(null);
  const locationSuggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAFT_KEY = 'profile_edit_draft_v1_simple';
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const imagePickerRef = useRef<ImagePickerModule | null>(null); // cache dynamic module
  const avatarDropRef = useRef<PressableHandle | null>(null);
  const [avatarDropActive, setAvatarDropActive] = useState(false);
  // Feature flags discovered at runtime (schema / native capabilities)
  const [supportsInstagram, setSupportsInstagram] = useState(true);
  const [supportsWhatsapp, setSupportsWhatsapp] = useState(true);
  const [supportsBio, setSupportsBio] = useState(true);
  const [supportsLocation, setSupportsLocation] = useState(true);
  const [supportsTraits, setSupportsTraits] = useState(true);
  const [locFetchBusy, setLocFetchBusy] = useState(false);
  const [locFetchError, setLocFetchError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const mergeBadges = useCallback((): MobileBadgeItem[] => {
    if (!catalogBadges.length) {
      return ownedBadges.map((owned) => ownedToMobileBadge(owned));
    }
    const ownedMap = new Map(ownedBadges.map((badge) => [badge.badge_id, badge]));
    return catalogBadges.map((entry) => {
      const owned = entry.owned ?? ownedMap.get(entry.catalog.id) ?? null;
      if (owned) {
        return ownedToMobileBadge(owned, entry.catalog);
      }
      return {
        badge_id: entry.catalog.id,
        status: 'unverified',
        locked: true,
        badges: entry.catalog,
      } satisfies MobileBadgeItem;
    });
  }, [catalogBadges, ownedBadges]);

  const restoreProfileFromCache = useCallback(async (uid: string) => {
    try {
      const raw = await AsyncStorage.getItem(profileCacheKey(uid));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProfileCachePayload> | null;
      if (!parsed || parsed.id !== uid) return;
      setSupportsInstagram(parsed.supportsInstagram ?? true);
      setSupportsWhatsapp(parsed.supportsWhatsapp ?? true);
      setSupportsBio(parsed.supportsBio ?? true);
      setSupportsLocation(parsed.supportsLocation ?? true);
      setSupportsTraits(parsed.supportsTraits ?? true);
      const cachedTraits = sanitizeProfileTraitList(parsed.personalityTraits ?? []);
      setPersonalityTraits(cachedTraits);
      const avatar = typeof parsed.avatar_url === 'string' ? parsed.avatar_url : '';
      const instagramVal = typeof parsed.instagram === 'string' ? parsed.instagram : '';
      const whatsappVal = typeof parsed.whatsapp === 'string' ? parsed.whatsapp : '';
      const bioVal = typeof parsed.bio === 'string' ? parsed.bio : '';
      const locationVal = typeof parsed.location === 'string' ? parsed.location : '';
      setFullName(typeof parsed.full_name === 'string' ? parsed.full_name : '');
      setAvatarUrl(avatar ? `${avatar}?v=${Date.now()}` : '');
      setInstagram(instagramVal);
      setWhatsapp(whatsappVal);
      setBio(bioVal);
      setLocationLabel(locationVal);
      setProfileLat(typeof parsed.last_lat === 'number' ? parsed.last_lat : null);
      setProfileLng(typeof parsed.last_lng === 'number' ? parsed.last_lng : null);
    } catch (error) {
      console.warn('[ProfileSimple] Failed to restore cached profile', error);
    }
  }, []);

  const loadBadges = useCallback(async (uid: string) => {
    try {
      const ownedUrl = createWebUrl(`/api/users/${uid}/badges`);
      const catalogUrl = createWebUrl('/api/badges/catalog');
      const [ownedRes, catalogRes] = await Promise.all([
        fetch(ownedUrl.toString(), { credentials: 'include' }),
        fetch(catalogUrl.toString(), { credentials: 'include' }),
      ]);
      if (ownedRes.ok) {
        const payload: unknown = await ownedRes.json();
        const badges = isRecord(payload) ? payload.badges : null;
        setOwnedBadges(parseOwnedBadges(badges));
      } else {
        setOwnedBadges([]);
      }
      if (catalogRes.ok) {
        const payload: unknown = await catalogRes.json();
        const badges = isRecord(payload) ? payload.badges : null;
        setCatalogBadges(parseCatalogBadges(badges));
      } else {
        setCatalogBadges([]);
      }
    } catch {
      setOwnedBadges([]);
      setCatalogBadges([]);
    }
  }, []);

  // Centralized profile fetch so we can reuse after mutations & auth events
  const fetchProfile = useCallback(async (uid: string, options?: { fallbackBio?: string | null; fallbackTraits?: string[] }) => {
    const fallbackBio = typeof options?.fallbackBio === 'string' ? options.fallbackBio : '';
    const buildColumns = (
      includeInstagram: boolean,
      includeWhatsapp: boolean,
      includeBio: boolean,
      includeLocation: boolean,
      includeTraits: boolean,
    ) => {
      const baseColumns = ['full_name', 'avatar_url'];
      if (includeInstagram) baseColumns.push('instagram');
      if (includeWhatsapp) baseColumns.push('whatsapp');
      if (includeBio) baseColumns.push('bio');
      if (includeLocation) baseColumns.push('location');
      if (includeTraits) baseColumns.push('personality_traits');
      baseColumns.push('last_lat', 'last_lng');
      return baseColumns;
    };

    let nextSupportsInstagram = supportsInstagram;
    let nextSupportsWhatsapp = supportsWhatsapp;
    let nextSupportsBio = supportsBio;
    let nextSupportsLocation = supportsLocation;
    let nextSupportsTraits = supportsTraits;

    setErr(null);

    try {
      const fallbackTraits = sanitizeProfileTraitList(options?.fallbackTraits ?? []);
      const requestedColumns = Array.from(
        new Set(buildColumns(nextSupportsInstagram, nextSupportsWhatsapp, nextSupportsBio, nextSupportsLocation, nextSupportsTraits)),
      );
      const { data, error } = await supabase
        .from('profiles')
        .select(requestedColumns.join(', '))
        .eq('id', uid)
        .maybeSingle<ProfileRow>();

      let row: ProfileRow | null = data ?? null;

      if (error) {
        const message = error.message ?? '';
        let retried = false;
        if (message.includes('instagram') && nextSupportsInstagram) {
          nextSupportsInstagram = false;
          retried = true;
        }
        if (message.includes('whatsapp') && nextSupportsWhatsapp) {
          nextSupportsWhatsapp = false;
          retried = true;
        }
        if (message.includes('bio') && nextSupportsBio) {
          nextSupportsBio = false;
          retried = true;
        }
        if (message.includes('location') && nextSupportsLocation) {
          nextSupportsLocation = false;
          retried = true;
        }
        if (message.includes('personality_traits') && nextSupportsTraits) {
          nextSupportsTraits = false;
          retried = true;
        }
        if (retried) {
          const fallbackColumns = buildColumns(
            nextSupportsInstagram,
            nextSupportsWhatsapp,
            nextSupportsBio,
            nextSupportsLocation,
            nextSupportsTraits,
          );
          const retry = await supabase
            .from('profiles')
            .select(fallbackColumns.join(', '))
            .eq('id', uid)
            .maybeSingle<ProfileRow>();
          if (retry.error) throw retry.error;
          row = retry.data ?? null;
        } else if (!/could not find the .* column/i.test(message)) {
          throw error;
        }
      }

      if (nextSupportsInstagram !== supportsInstagram) setSupportsInstagram(nextSupportsInstagram);
      if (nextSupportsWhatsapp !== supportsWhatsapp) setSupportsWhatsapp(nextSupportsWhatsapp);
      if (nextSupportsBio !== supportsBio) setSupportsBio(nextSupportsBio);
      if (nextSupportsLocation !== supportsLocation) {
        setSupportsLocation(nextSupportsLocation);
        if (!nextSupportsLocation) {
          setDraftLocationSelection(null);
          setLocationSuggestions([]);
          setLocationSuggestionsLoading(false);
        }
      }
      if (nextSupportsTraits !== supportsTraits) setSupportsTraits(nextSupportsTraits);

      const resolved: ProfileCachePayload = {
        id: uid,
        full_name: row?.full_name ?? '',
        avatar_url: row?.avatar_url ?? '',
        instagram: nextSupportsInstagram ? row?.instagram ?? '' : instagram,
        whatsapp: nextSupportsWhatsapp ? row?.whatsapp ?? '' : whatsapp,
        bio: nextSupportsBio ? row?.bio ?? '' : (fallbackBio || bio),
        location: nextSupportsLocation ? row?.location ?? '' : locationLabel,
        supportsInstagram: nextSupportsInstagram,
        supportsWhatsapp: nextSupportsWhatsapp,
        supportsBio: nextSupportsBio,
        supportsLocation: nextSupportsLocation,
        supportsTraits: nextSupportsTraits,
        last_lat: typeof row?.last_lat === 'number' ? row.last_lat : profileLat,
        last_lng: typeof row?.last_lng === 'number' ? row.last_lng : profileLng,
        updated_at: row?.updated_at ?? null,
        personalityTraits: nextSupportsTraits ? sanitizeProfileTraitList(row?.personality_traits ?? null) : fallbackTraits,
      };

      setFullName(resolved.full_name);
      setAvatarUrl(resolved.avatar_url ? `${resolved.avatar_url}?v=${Date.now()}` : '');
      setInstagram(resolved.instagram);
      setWhatsapp(resolved.whatsapp);
      setBio(resolved.bio);
      setLocationLabel(resolved.location);
      setProfileLat(resolved.last_lat ?? null);
      setProfileLng(resolved.last_lng ?? null);
      setPersonalityTraits(resolved.personalityTraits);

      try {
        await AsyncStorage.setItem(profileCacheKey(uid), JSON.stringify(resolved));
      } catch (cacheErr) {
        console.warn('[ProfileSimple] Failed to cache profile snapshot', cacheErr);
      }

      return resolved;
    } catch (error) {
      const message = describeError(error, 'Unable to load your profile right now.');
      if (/column\s+profiles\./i.test(message)) {
        console.info('[ProfileSimple] Optional profile column missing; continuing with cached data.');
        if (/profiles\.bio/i.test(message)) setSupportsBio(false);
        if (/profiles\.instagram/i.test(message)) setSupportsInstagram(false);
        if (/profiles\.whatsapp/i.test(message)) setSupportsWhatsapp(false);
        if (/profiles\.location/i.test(message)) setSupportsLocation(false);
        setErr(null);
        return null;
      }
      console.warn('[ProfileSimple] fetchProfile failed', error);
      setErr(message);
      return null;
    }
  }, [supportsInstagram, supportsWhatsapp, supportsBio, supportsLocation, supportsTraits, instagram, whatsapp, bio, locationLabel, profileLat, profileLng]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        const fallbackTraits = sanitizeProfileTraitList(auth?.user?.user_metadata?.personality_traits);
        await Promise.all([
          fetchProfile(uid, { fallbackBio: bio, fallbackTraits }),
          loadBadges(uid),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfile, loadBadges, bio]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setEmail(auth?.user?.email ?? null);
      setSignedIn(Boolean(uid));

      if (uid) {
        userIdRef.current = uid;
        await restoreProfileFromCache(uid);
        const fallbackBio = typeof auth?.user?.user_metadata?.bio === 'string' ? auth.user.user_metadata.bio : '';
        const fallbackTraits = sanitizeProfileTraitList(auth?.user?.user_metadata?.personality_traits);
        await fetchProfile(uid, { fallbackBio, fallbackTraits });
        await loadBadges(uid);
      } else {
        userIdRef.current = null;
        setSignedIn(false);
      }

      // Listen for future sign-ins (e.g., after a logout/login cycle) and refetch
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          const signedInId = session.user.id;
          userIdRef.current = signedInId;
          setEmail(session.user.email ?? null);
          setSignedIn(true);
          await restoreProfileFromCache(signedInId);
          const metaBio = typeof session.user.user_metadata?.bio === 'string' ? session.user.user_metadata?.bio : '';
          const metaTraits = sanitizeProfileTraitList(session.user.user_metadata?.personality_traits);
          await fetchProfile(signedInId, { fallbackBio: metaBio, fallbackTraits: metaTraits });
          await loadBadges(signedInId);
        } else if (event === 'SIGNED_OUT') {
          userIdRef.current = null;
          setEmail(null);
          setSignedIn(false);
          setFullName('');
          setAvatarUrl('');
          setInstagram('');
          setWhatsapp('');
          setBio('');
          setLocationLabel('');
          setSupportsInstagram(true);
          setSupportsWhatsapp(true);
          setSupportsBio(true);
          setSupportsLocation(true);
          setSupportsTraits(true);
          setPersonalityTraits([]);
          setDraftLocation('');
          setDraftLocationSelection(null);
          setLocationSuggestions([]);
          setLocationSuggestionsLoading(false);
          setLocFetchError(null);
          setLocFetchBusy(false);
        }
      });
      unsub = () => listener.subscription.unsubscribe();
    })();
    return () => { if (unsub) unsub(); };
  }, [fetchProfile, loadBadges, restoreProfileFromCache]);

  useEffect(() => {
    if (editOpen) return;
    if (locationLabel && typeof profileLat === 'number' && typeof profileLng === 'number') {
      setDraftLocationSelection({ id: 'current', label: locationLabel, description: null, lat: profileLat, lng: profileLng });
    } else {
      setDraftLocationSelection(null);
    }
  }, [editOpen, locationLabel, profileLat, profileLng]);

  function openEdit() {
    setDraftFullName(fullName);
    setDraftInstagram(instagram);
    setDraftWhatsapp(whatsapp);
    setDraftBio(bio);
    setDraftLocation(locationLabel);
    if (locationLabel && typeof profileLat === 'number' && typeof profileLng === 'number') {
      setDraftLocationSelection({ id: 'existing', label: locationLabel, description: null, lat: profileLat, lng: profileLng });
    } else {
      setDraftLocationSelection(null);
    }
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);
    setMsg(null); setErr(null);
    setLocFetchError(null);
    setLocFetchBusy(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          setDraftFullName(d.fullName || '');
          setDraftInstagram(d.instagram || '');
          setDraftWhatsapp(d.whatsapp || '');
          setDraftBio(d.bio || '');
          const nextDraftLocation = d.location || '';
          setDraftLocation(nextDraftLocation);
          if (!nextDraftLocation || nextDraftLocation !== locationLabel) {
            setDraftLocationSelection(null);
          }
        }
      } catch {/* ignore */}
      setEditOpen(true);
    })();
  }

  const performSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      Alert.alert('Sign out failed', describeError(error, 'Unable to sign out right now. Try again in a moment.'));
    } finally {
      setSigningOut(false);
    }
  }, []);

  const confirmSignOut = useCallback(() => {
    if (signingOut) return;
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: signingOut ? 'Signing out…' : 'Sign out',
        style: 'destructive',
        onPress: () => {
          void performSignOut();
        },
      },
    ]);
  }, [performSignOut, signingOut]);

  function applyDraftsToState() {
    setFullName(draftFullName);
    setInstagram(draftInstagram);
    setWhatsapp(draftWhatsapp);
    setBio(draftBio);
    setLocationLabel(draftLocation);
  }

  async function saveEdits() {
    setErr(null);
    setMsg(null);
    setLocFetchError(null);
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Please sign in first.');

      const cleanInstagram = (v: string) => {
        let val = (v || '').trim();
        if (!val) return '';
        val = val
          .replace(/@/g, '')
          .replace(/^https?:\/\/([^/]*instagram\.com)\//i, '')
          .replace(/^instagram\.com\//i, '')
          .replace(/^www\.instagram\.com\//i, '');
        val = val.split(/[?#]/)[0].replace(/\/+$/g, '');
        return val.slice(0, 50);
      };

      const cleanWhatsApp = (v: string) => {
        let val = (v || '').trim();
        if (!val) return '';
        val = val
          .replace(/^https?:\/\/wa\.me\//i, '')
          .replace(/^https?:\/\/api\.whatsapp\.com\/send\?phone=/i, '')
          .replace(/^wa\.me\//i, '')
          .replace(/^api\.whatsapp\.com\/send\?phone=/i, '');
        val = val.replace(/[^+\d]/g, '');
        val = val.replace(/^(\++)/, '+');
        if (val.startsWith('+')) {
          val = '+' + val.slice(1).replace(/\D/g, '').slice(0, 15);
        } else {
          val = val.replace(/\D/g, '').slice(0, 15);
        }
        return val;
      };

      const cleanAvatarUrl = avatarUrl ? avatarUrl.split('?')[0] : null;
      const normalizedBio = (draftBio ?? '').toString().slice(0, 500);
      const rawLocationInput = (draftLocation ?? '').toString().slice(0, 120);
      const trimmedLocationInput = rawLocationInput.trim();
      const existingLocation = locationLabel || '';
      let canUseLocation = supportsLocation;

      let finalLocationLabel = trimmedLocationInput;
      let locationLat = profileLat ?? null;
      let locationLng = profileLng ?? null;
      let coordsResolved = false;

      if (
        trimmedLocationInput &&
        draftLocationSelection &&
        draftLocationSelection.label === trimmedLocationInput
      ) {
        locationLat = draftLocationSelection.lat;
        locationLng = draftLocationSelection.lng;
        coordsResolved =
          typeof draftLocationSelection.lat === 'number' && Number.isFinite(draftLocationSelection.lat) &&
          typeof draftLocationSelection.lng === 'number' && Number.isFinite(draftLocationSelection.lng);
      }

      const shouldGeocode = trimmedLocationInput
        ? !coordsResolved && (trimmedLocationInput !== existingLocation || locationLat == null || locationLng == null)
        : true;

      if (trimmedLocationInput && shouldGeocode) {
        try {
          const resolved = await resolveForwardGeocode(trimmedLocationInput);
          if (resolved) {
            locationLat = resolved.lat;
            locationLng = resolved.lng;
            finalLocationLabel = resolved.label;
            coordsResolved = Number.isFinite(locationLat) && Number.isFinite(locationLng);
            setDraftLocationSelection(resolved);
          } else {
            coordsResolved = false;
          }
        } catch (geoError) {
          console.warn('[ProfileSimple] forward geocode failed', geoError);
          coordsResolved = false;
        }
        if (!coordsResolved) {
          setLocFetchError('Unable to find that location. Saved without map focus.');
          locationLat = null;
          locationLng = null;
        }
      } else if (!trimmedLocationInput) {
        locationLat = null;
        locationLng = null;
        finalLocationLabel = '';
      }

      const basePayload: ProfileUpdatePayload = {
        id: uid,
        full_name: draftFullName.trim() || null,
        avatar_url: cleanAvatarUrl,
        updated_at: new Date().toISOString(),
      };
      if (canUseLocation) {
        basePayload.last_lat = locationLat;
        basePayload.last_lng = locationLng;
      }

      const attemptBaseUpsert = async (payload: ProfileUpdatePayload) => {
        const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      };

      try {
        await attemptBaseUpsert(basePayload);
      } catch (baseError: unknown) {
        const message =
          typeof baseError === 'object' && baseError && 'message' in baseError && typeof (baseError as { message: unknown }).message === 'string'
            ? ((baseError as { message: string }).message.toLowerCase())
            : '';
        if (canUseLocation && /last_(lat|lng)/.test(message)) {
          canUseLocation = false;
          setSupportsLocation(false);
          setDraftLocationSelection(null);
          setLocationSuggestions([]);
          setLocationSuggestionsLoading(false);
          const fallbackPayload: ProfileUpdatePayload = {
            id: uid,
            full_name: basePayload.full_name,
            avatar_url: basePayload.avatar_url,
            updated_at: basePayload.updated_at,
          };
          await attemptBaseUpsert(fallbackPayload);
        } else {
          throw baseError;
        }
      }

      const optionalFields: Array<{
        key: keyof ProfileUpdatePayload;
        value: string | null;
        supported: boolean;
        disable: () => void;
      }> = [
        {
          key: 'instagram',
          value: cleanInstagram(draftInstagram) || null,
          supported: supportsInstagram,
          disable: () => setSupportsInstagram(false),
        },
        {
          key: 'whatsapp',
          value: cleanWhatsApp(draftWhatsapp) || null,
          supported: supportsWhatsapp,
          disable: () => setSupportsWhatsapp(false),
        },
        {
          key: 'bio',
          value: normalizedBio ? normalizedBio : null,
          supported: supportsBio,
          disable: () => setSupportsBio(false),
        },
        {
          key: 'location',
          value: finalLocationLabel ? finalLocationLabel : null,
          supported: canUseLocation,
          disable: () => {
            canUseLocation = false;
            setSupportsLocation(false);
            setDraftLocationSelection(null);
            setLocationSuggestions([]);
            setLocationSuggestionsLoading(false);
          },
        },
      ];

      const metadataFallback: Record<string, string | null> = {};

      for (const field of optionalFields) {
        const { key, value, supported, disable } = field;
        metadataFallback[key] = value;
        if (!supported) continue;

        const { error } = await supabase
          .from('profiles')
          .update({ [key]: value })
          .eq('id', uid);

        if (error) {
          const message = error.message ?? '';
          const normalized = message.toLowerCase();
          if (/column .* does not exist/i.test(normalized)) {
            disable();
            continue;
          }
          const cacheMatch = message.match(/could not find the '([^']+)' column/i);
          if (cacheMatch) {
            const missing = cacheMatch[1];
            if (missing && missing === key) {
              disable();
              continue;
            }
          }
          throw error;
        }
      }

      if (canUseLocation) {
        try {
          const { error: coordError } = await supabase
            .from('profiles')
            .update({ last_lat: locationLat, last_lng: locationLng })
            .eq('id', uid);
          if (coordError) {
            const msg = coordError.message?.toLowerCase?.() ?? '';
            if (/column .* does not exist/i.test(msg)) {
            canUseLocation = false;
            setSupportsLocation(false);
            setDraftLocationSelection(null);
            setLocationSuggestions([]);
            setLocationSuggestionsLoading(false);
            } else {
              throw coordError;
            }
          }
        } catch (coordError) {
          console.warn('[ProfileSimple] failed to persist location coordinates', coordError);
        }
      }

      metadataFallback.location = finalLocationLabel ? finalLocationLabel : null;

      setDraftLocation(finalLocationLabel);
      applyDraftsToState();
      setProfileLat(locationLat ?? null);
      setProfileLng(locationLng ?? null);
      if (coordsResolved && typeof locationLat === 'number' && typeof locationLng === 'number' && finalLocationLabel) {
        setDraftLocationSelection({ id: 'saved', label: finalLocationLabel, description: null, lat: locationLat, lng: locationLng });
      } else if (!finalLocationLabel) {
        setDraftLocationSelection(null);
      }
      setLocationSuggestions([]);
      setLocationSuggestionsLoading(false);

      try {
        await supabase.auth.updateUser({
          data: {
            bio: metadataFallback.bio || null,
            instagram: metadataFallback.instagram || null,
            whatsapp: metadataFallback.whatsapp || null,
            location: metadataFallback.location || null,
          },
        });
      } catch (metaError) {
        console.warn('[ProfileSimple] Failed to persist metadata fallback', metaError);
      }

      if (uid) await fetchProfile(uid, { fallbackBio: metadataFallback.bio || null });
      setMsg('Saved');
      if (canUseLocation && coordsResolved && typeof locationLat === 'number' && typeof locationLng === 'number' && finalLocationLabel) {
        emitProfileLocationUpdated({ lat: locationLat, lng: locationLng, label: finalLocationLabel });
      }
      try {
        await AsyncStorage.removeItem(DRAFT_KEY);
      } catch {}
      setDraftSavedAt(null);
      setEditOpen(false);
    } catch (error) {
      const message = describeError(error, 'Failed to save profile.');
      console.error('[ProfileSimple] saveEdits failed', error);
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  // Draft persistence
  useEffect(() => {
    if (!editOpen) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            fullName: draftFullName,
            instagram: draftInstagram,
            whatsapp: draftWhatsapp,
            bio: draftBio,
            location: draftLocation,
          }),
        );
        setDraftSavedAt(Date.now());
      } catch {}
    }, 400);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [draftFullName, draftInstagram, draftWhatsapp, draftBio, draftLocation, editOpen]);

  function clearDraft() {
    setDraftFullName(fullName);
    setDraftInstagram(instagram);
    setDraftWhatsapp(whatsapp);
    setDraftBio(bio);
    setDraftLocation(locationLabel);
    if (locationLabel && typeof profileLat === 'number' && typeof profileLng === 'number') {
    setDraftLocationSelection({ id: 'existing', label: locationLabel, description: null, lat: profileLat, lng: profileLng });
  } else {
    setDraftLocationSelection(null);
  }
  setLocationSuggestions([]);
  setLocationSuggestionsLoading(false);
  setLocFetchError(null);
  AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  setDraftSavedAt(null);
  }

  const handleDraftLocationChange = useCallback(
    (value: string) => {
      const trimmed = value.slice(0, 120);
      setDraftLocation(trimmed);
      if (draftLocationSelection && draftLocationSelection.label !== trimmed) {
        setDraftLocationSelection(null);
      }
      setLocFetchError(null);
      if (!trimmed || trimmed.trim().length < 2) {
        if (locationSuggestionDebounceRef.current) {
          clearTimeout(locationSuggestionDebounceRef.current);
          locationSuggestionDebounceRef.current = null;
        }
        if (locationSuggestionControllerRef.current) {
          locationSuggestionControllerRef.current.abort();
          locationSuggestionControllerRef.current = null;
        }
        setLocationSuggestions([]);
        setLocationSuggestionsLoading(false);
      }
    },
    [draftLocationSelection],
  );

  const handleUseDeviceLocation = useCallback(async () => {
    setLocFetchError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
      setLocFetchError('Location permission denied.');
      return;
    }
    setLocFetchBusy(true);
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = position.coords;
    let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      const reverseLabel = await reverseGeocode(latitude, longitude);
      if (reverseLabel) {
        label = reverseLabel;
      }
      if (locationSuggestionDebounceRef.current) {
        clearTimeout(locationSuggestionDebounceRef.current);
        locationSuggestionDebounceRef.current = null;
      }
      if (locationSuggestionControllerRef.current) {
        locationSuggestionControllerRef.current.abort();
        locationSuggestionControllerRef.current = null;
      }
      setDraftLocation(label);
      setDraftLocationSelection({ id: `device-${Date.now()}`, label, description: null, lat: latitude, lng: longitude });
      setLocationSuggestions([]);
      setLocationSuggestionsLoading(false);
      setLocFetchError(null);
    } catch (error) {
      setLocFetchError(describeError(error, 'Unable to fetch your location.'));
    } finally {
      setLocFetchBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!editOpen || !supportsLocation) return;
    const query = (draftLocation ?? '').trim();

    if (locationSuggestionDebounceRef.current) {
      clearTimeout(locationSuggestionDebounceRef.current);
      locationSuggestionDebounceRef.current = null;
    }

    if (!query || query.length < 2 || (draftLocationSelection && draftLocationSelection.label === query)) {
      if (locationSuggestionControllerRef.current) {
        locationSuggestionControllerRef.current.abort();
        locationSuggestionControllerRef.current = null;
      }
      setLocationSuggestions([]);
      setLocationSuggestionsLoading(false);
      return;
    }

    locationSuggestionDebounceRef.current = setTimeout(() => {
      if (locationSuggestionControllerRef.current) {
        locationSuggestionControllerRef.current.abort();
      }
      const controller = new AbortController();
      locationSuggestionControllerRef.current = controller;
      setLocationSuggestionsLoading(true);
      fetchGeocodeSuggestions(query, MAX_LOCATION_SUGGESTIONS, controller.signal)
        .then((suggestions) => {
          if (controller.signal.aborted) return;
          setLocationSuggestions(suggestions);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.info('[ProfileSimple] location suggestions failed', error);
          setLocationSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLocationSuggestionsLoading(false);
          }
          if (locationSuggestionControllerRef.current === controller) {
            locationSuggestionControllerRef.current = null;
          }
        });
    }, 350);

    return () => {
      if (locationSuggestionDebounceRef.current) {
        clearTimeout(locationSuggestionDebounceRef.current);
        locationSuggestionDebounceRef.current = null;
      }
    };
  }, [draftLocation, editOpen, supportsLocation, draftLocationSelection]);

  useEffect(() => {
    if (editOpen) return;
    if (locationSuggestionControllerRef.current) {
      locationSuggestionControllerRef.current.abort();
      locationSuggestionControllerRef.current = null;
    }
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);
  }, [editOpen]);

  useEffect(() => () => {
    if (locationSuggestionControllerRef.current) {
      locationSuggestionControllerRef.current.abort();
      locationSuggestionControllerRef.current = null;
    }
  }, []);

  const handleSelectLocationSuggestion = useCallback((suggestion: LocationSuggestion) => {
    if (locationSuggestionDebounceRef.current) {
      clearTimeout(locationSuggestionDebounceRef.current);
      locationSuggestionDebounceRef.current = null;
    }
    if (locationSuggestionControllerRef.current) {
      locationSuggestionControllerRef.current.abort();
      locationSuggestionControllerRef.current = null;
    }
    setDraftLocation(suggestion.label);
    setDraftLocationSelection(suggestion);
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);
    setLocFetchError(null);
  }, []);

  async function ensureImagePicker(): Promise<ImagePickerModule> {
    if (imagePickerRef.current) return imagePickerRef.current;
    if (eagerImagePicker) {
      imagePickerRef.current = eagerImagePicker;
      return eagerImagePicker;
    }
    try {
      const { NativeModulesProxy } = await import('expo-modules-core');
      const modules = NativeModulesProxy as Record<string, unknown>;
      const hasNative = Boolean(modules?.ExponentImagePicker || modules?.ExpoImagePicker);
      if (!hasNative) {
        console.info('[ProfileSimple] expo-image-picker native module not detected; continuing to attempt dynamic import');
      }
    } catch (inspectErr) {
      console.info('[ProfileSimple] Unable to inspect native modules for expo-image-picker', inspectErr);
    }

    try {
      const mod: ImagePickerModule = await import('expo-image-picker');
      imagePickerRef.current = mod;
      return mod;
    } catch (importErr) {
      console.warn('[ProfileSimple] expo-image-picker import failed', importErr);
      throw new Error('Image picker unavailable (module failed to load). Rebuild the native app with expo-image-picker installed.');
    }
  }

  const uploadAvatarFile = useCallback(
    async (
      uid: string,
      file: {
        uri?: string;
        fileName?: string | null;
        mimeType?: string | null;
        webFile?: WebFile;
      },
    ) => {
      const storage = supabase.storage.from('avatars');
      const filenameSource = file.fileName || file.uri?.split('/').pop() || `avatar-${Date.now()}`;
      let ext = filenameSource?.split('.').pop()?.toLowerCase() || 'jpg';
      if (ext === 'heic' || ext === 'heif') ext = 'jpg';
      const path = `${uid}/avatar.${ext}`;

      let body: Uint8Array | ArrayBuffer | File | Blob;
      if (Platform.OS === 'web' && file.webFile) {
        body = file.webFile;
      } else {
        if (!file.uri) throw new Error('Unable to locate selected image.');
        const response = await fetch(file.uri);
        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Selected image appears empty. Please try another file.');
        }
        body = new Uint8Array(arrayBuffer);
      }

      await storage.remove([path]).catch(() => {});
      const { error: uploadError } = await storage.upload(path, body, {
        contentType: file.mimeType || 'image/jpeg',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: pub } = storage.getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error('Unable to obtain uploaded avatar URL.');

      setAvatarUrl(`${pub.publicUrl}?t=${Date.now()}`);

      const { error: profErr } = await supabase
        .from('profiles')
        .upsert({ id: uid, avatar_url: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (profErr) throw profErr;

      await fetchProfile(uid);
    },
    [fetchProfile]
  );

  async function pickAvatar() {
    setErr(null); setMsg(null);
    let startedUpload = false;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (!uid) throw new Error('Sign in first.');
      const source = await chooseAvatarSource();
      if (!source) return;
      const ImagePicker = await ensureImagePicker();
      const granted = await requestPickerPermission(ImagePicker, source);
      if (!granted) {
        setMsg('Photo permission is required to change your avatar.');
        return;
      }
      const res = await launchPicker(ImagePicker, source);
      if (res.canceled || !res.assets?.length) { return; }
      startedUpload = true;
      setAvatarUploading(true);
      const picked = res.assets[0];
      await uploadAvatarFile(uid, {
        uri: picked.uri,
        fileName: picked.fileName ?? picked.uri.split('/').pop(),
        mimeType: picked.mimeType ?? undefined,
      });
      setMsg('Avatar updated');
    } catch (error) {
      setErr(describeError(error, 'Avatar update failed'));
    } finally {
      if (startedUpload) {
        setAvatarUploading(false);
      }
    }
  }

  const mergedBadges = mergeBadges();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = avatarDropRef.current;
    const element = node as unknown as HtmlElementLike | null;
    if (!element || typeof element.addEventListener !== 'function' || typeof element.removeEventListener !== 'function') {
      return;
    }

    const handleDragOver = (event: DragEventLike) => {
      event.preventDefault();
      setAvatarDropActive(true);
    };

    const handleDragLeave = () => {
      setAvatarDropActive(false);
    };

    const handleDrop = async (event: DragEventLike) => {
      event.preventDefault();
      setAvatarDropActive(false);
      const files = event.dataTransfer?.files;
      if (!files || !files.length) return;
      const file = files[0];
      if (!file?.type?.startsWith('image/')) {
        setErr('Please drop an image file.');
        return;
      }
      setAvatarUploading(true);
      setErr(null);
      setMsg(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id; if (!uid) throw new Error('Sign in first.');
        await uploadAvatarFile(uid, {
          webFile: file,
          fileName: file.name,
          mimeType: file.type,
        });
        setMsg('Avatar updated');
      } catch (error) {
        setErr(describeError(error, 'Avatar update failed'));
      } finally {
        setAvatarUploading(false);
      }
    };

    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);

    return () => {
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('drop', handleDrop);
    };
  }, [uploadAvatarFile, supabase]);

  if (!signedIn) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg, padding: 24 }}>
        <Text style={{ color: theme.colors.ink60, textAlign: 'center' }}>Please sign in to view your profile.</Text>
      </View>
    );
  }


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentInsetAdjustmentBehavior="never"
      >
        <LinearGradient
          colors={[theme.colors.brandTeal, theme.colors.brandTealDark]}
          style={{ paddingTop: 16 + insets.top, paddingBottom: 24, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
        >
        <Link href="/" asChild><Pressable><Text style={{ color:'white' }}>&larr; Home</Text></Pressable></Link>
        <View style={{ flexDirection:'row', alignItems:'center', marginTop:16, gap:12 }}>
          <Pressable
            ref={avatarDropRef}
            onPress={pickAvatar}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: avatarDropActive ? '#dbeafe' : '#fff',
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: avatarDropActive ? 2 : 0,
              borderColor: avatarDropActive ? '#2563EB' : 'transparent',
            }}
          >
            {avatarUploading ? (
              <ActivityIndicator />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 32 }}>🙂</Text>
            )}
            <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2 }}>
              <Text style={{ color: 'white', fontSize: 10, textAlign: 'center' }}>
                {avatarUploading
                  ? 'Uploading'
                  : avatarDropActive && Platform.OS === 'web'
                    ? 'Drop image'
                    : 'Change'}
              </Text>
            </View>
          </Pressable>
          <View style={{ flex:1 }}>
            <Text style={{ color:'white', fontSize:20, fontWeight:'800' }}>{fullName || 'Your name'}</Text>
            {!!email && <Text style={{ color:'white', opacity:0.9 }}>{email}</Text>}
            <Pressable
              onPress={openEdit}
              style={{ marginTop:6, alignSelf:'flex-start', paddingVertical:4, paddingHorizontal:10, borderRadius:999, backgroundColor:'rgba(255,255,255,0.15)' }}
            >
              <Text style={{ color:'white', fontSize:12, fontWeight:'600' }}>
                {locationLabel ? `📍 ${locationLabel}` : '📍 Add location'}
              </Text>
            </Pressable>
            {err?.toLowerCase().includes('image picker native module missing') && (
              <Text style={{ marginTop:4, fontSize:10, color:'#fde68a' }}>Rebuild dev client to enable changing the photo.</Text>
            )}
          </View>
        </View>
      </LinearGradient>

      <View style={{ marginTop:16, marginHorizontal:16 }}>
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12 }}>
          <Pressable onPress={openEdit} style={{ alignSelf:'flex-start', backgroundColor: theme.colors.brandTeal, paddingVertical:10, paddingHorizontal:18, borderRadius:999 }}>
            <Text style={{ color:'white', fontWeight:'600' }}>Edit Profile</Text>
          </Pressable>
          <Pressable
            onPress={confirmSignOut}
            disabled={signingOut}
            style={{
              alignSelf:'flex-start',
              paddingVertical:10,
              paddingHorizontal:18,
              borderRadius:999,
              borderWidth:1,
              borderColor:'#dc2626',
              backgroundColor: signingOut ? 'rgba(248,113,113,0.15)' : 'transparent',
              opacity: signingOut ? 0.7 : 1,
            }}
          >
            <Text style={{ color:'#dc2626', fontWeight:'600' }}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
          </Pressable>
        </View>
        {msg && <Text style={{ marginTop:8, color:'#065f46' }}>{msg}</Text>}
        {err && <Text style={{ marginTop:8, color:'#b91c1c' }}>{err}</Text>}
      </View>

      <View style={{ marginTop:12, marginHorizontal:16, backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor:'#e5e7eb' }}>
        <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:8, borderBottomWidth:1, borderBottomColor:'#f3f4f6', flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <Text style={{ fontSize:14, fontWeight:'700', color: theme.colors.brandInk }}>Location</Text>
          <Pressable onPress={openEdit}>
            <Text style={{ color: theme.colors.brandTeal, fontWeight:'600', fontSize:12 }}>Update</Text>
          </Pressable>
        </View>
        <View style={{ padding:14 }}>
          <Text style={{ color:'#374151', lineHeight:20, opacity: locationLabel ? 1 : 0.55 }}>
            {locationLabel || 'No location set. Tap Update to add one.'}
          </Text>
        </View>
      </View>

      <View style={{ marginTop:12, marginHorizontal:16, backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor:'#e5e7eb' }}>
        <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:8, borderBottomWidth:1, borderBottomColor:'#f3f4f6', flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <Text style={{ fontSize:14, fontWeight:'700', color: theme.colors.brandInk }}>Personality traits</Text>
        </View>
        <View style={{ padding:14, gap:10 }}>
          {supportsTraits ? (
            personalityTraits.length ? (
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                {personalityTraits.map((trait) => (
                  <View
                    key={trait}
                    style={{
                      paddingVertical:6,
                      paddingHorizontal:12,
                      borderRadius:999,
                      borderWidth:1,
                      borderColor:'#c7d2fe',
                      backgroundColor:'#eef2ff',
                    }}
                  >
                    <Text style={{ color:'#1e1b4b', fontWeight:'600' }}>{trait}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color:'#94a3b8', fontSize:13 }}>Add a few traits during signup or in a future profile update to showcase your vibe.</Text>
            )
          ) : (
            <Text style={{ color:'#b45309', fontSize:13 }}>Traits are not enabled on this project yet. Run the latest migrations to turn them on.</Text>
          )}
        </View>
      </View>

      {/* About / Bio card */}
      <View style={{ marginTop:12, marginHorizontal:16, backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor:'#e5e7eb' }}>
        <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:8, borderBottomWidth:1, borderBottomColor:'#f3f4f6' }}>
          <Text style={{ fontSize:14, fontWeight:'700', color: theme.colors.brandInk }}>About</Text>
        </View>
        <View style={{ padding:14 }}>
          <Text style={{ color:'#374151', lineHeight:20, minHeight:40, opacity: bio?1:0.55 }}>
            {bio || 'No bio yet. Tap Edit Profile to add one.'}
          </Text>
        </View>
      </View>

      {(!!instagram || !!whatsapp) && (
        <View style={{ marginTop:12, marginHorizontal:16, backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor:'#e5e7eb' }}>
          <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:8, borderBottomWidth:1, borderBottomColor:'#f3f4f6' }}>
            <Text style={{ fontSize:14, fontWeight:'700', color: theme.colors.brandInk }}>Socials</Text>
          </View>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, padding:12 }}>
            {!!instagram && (
              <Pressable
                onPress={() => {
                  const handle = instagram.replace(/^@+/, '');
                  const appUrl = `instagram://user?username=${handle}`;
                  const webUrl = `https://instagram.com/${handle}`;
                  Linking.openURL(appUrl).catch(()=>Linking.openURL(webUrl));
                }}
                style={{ flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, paddingHorizontal:12, borderRadius:999, backgroundColor:'#f1f5f9', borderWidth:1, borderColor:'#e2e8f0' }}
              >
                <Text style={{ fontSize:16 }}>📷</Text>
                <Text style={{ color:'#111827', fontWeight:'600' }}>@{instagram.replace(/^@+/, '')}</Text>
              </Pressable>
            )}
            {!!whatsapp && (
              <Pressable
                onPress={() => {
                  const phone = whatsapp;
                  const waUrl = `https://wa.me/${phone.replace(/[^\d+]/g,'')}`;
                  Linking.openURL(waUrl).catch(()=>{});
                }}
                style={{ flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, paddingHorizontal:12, borderRadius:999, backgroundColor:'#f1f5f9', borderWidth:1, borderColor:'#e2e8f0' }}
              >
                <Text style={{ fontSize:16 }}>💬</Text>
                <Text style={{ color:'#111827', fontWeight:'600' }}>{whatsapp}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={()=>setEditOpen(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20 }}>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius:20, padding:20, maxHeight:'85%' }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <Text style={{ fontSize:18, fontWeight:'700', color: theme.colors.brandInk }}>Edit Profile</Text>
              {draftSavedAt && <Text style={{ fontSize:10, color: theme.colors.ink60 }}>Draft {Math.round((Date.now()-draftSavedAt)/1000)}s ago</Text>}
            </View>
            {err && <Text style={{ marginBottom:8, color:'#b91c1c' }}>{err}</Text>}
            <ScrollView style={{ maxHeight:'70%' }} keyboardShouldPersistTaps="handled">
              <Text style={{ marginBottom:6, color: theme.colors.ink60 }}>Full Name</Text>
              <TextInput value={draftFullName} onChangeText={setDraftFullName} style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb' }} />
              <Text style={{ marginTop:10, marginBottom:6, color: theme.colors.ink60 }}>Bio</Text>
              <TextInput
                value={draftBio}
                onChangeText={setDraftBio}
                placeholder="Write something about yourself"
                multiline
                numberOfLines={4}
                style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb', minHeight:96, textAlignVertical:'top' }}
              />
              {supportsLocation ? (
                <>
                  <Text style={{ marginTop:10, marginBottom:6, color: theme.colors.ink60 }}>Location</Text>
                  <TextInput
                    value={draftLocation}
                    onChangeText={handleDraftLocationChange}
                    placeholder="City, neighbourhood, or leave blank"
                    style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb' }}
                  />
                  {supportsLocation && editOpen && draftLocation.trim().length >= 2 && (
                    <>
                      {locationSuggestionsLoading && (
                        <View style={{ flexDirection:'row', alignItems:'center', marginTop:6, gap:8 }}>
                          <ActivityIndicator size="small" color="#0c4a6e" />
                          <Text style={{ color:'#0c4a6e', fontSize:12 }}>Searching…</Text>
                        </View>
                      )}
                      {locationSuggestions.length > 0 && (
                        <View style={{ marginTop:6, borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, backgroundColor:'#f8fafc' }}>
                          {locationSuggestions.map((suggestion, index) => (
                            <Pressable
                              key={suggestion.id}
                              onPress={() => handleSelectLocationSuggestion(suggestion)}
                              style={{
                                paddingVertical:10,
                                paddingHorizontal:12,
                                borderBottomWidth: index === locationSuggestions.length - 1 ? 0 : 1,
                                borderBottomColor:'#e2e8f0',
                              }}
                            >
                              <Text style={{ color:'#0f172a', fontWeight:'600' }}>{suggestion.label}</Text>
                              {suggestion.description && suggestion.description !== suggestion.label && (
                                <Text style={{ marginTop:2, color:'#475569', fontSize:12 }}>{suggestion.description}</Text>
                              )}
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                  <View style={{ flexDirection:'row', alignItems:'center', marginTop:6, gap:8 }}>
                    <Pressable
                      onPress={handleUseDeviceLocation}
                      disabled={locFetchBusy}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:999, backgroundColor:'#e0f2fe', opacity: locFetchBusy ? 0.6 : 1 }}
                    >
                      <Text style={{ color:'#0c4a6e', fontWeight:'600', fontSize:12 }}>
                        {locFetchBusy ? 'Locating…' : 'Use my current location'}
                      </Text>
                    </Pressable>
                    {!!draftLocation && (
                      <Pressable
                        onPress={() => {
                          setDraftLocation('');
                          setDraftLocationSelection(null);
                          setLocationSuggestions([]);
                          setLocationSuggestionsLoading(false);
                          setLocFetchError(null);
                        }}
                        style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:999, borderWidth:1, borderColor:'#d1d5db' }}
                      >
                        <Text style={{ color:'#374151', fontWeight:'600', fontSize:12 }}>Clear</Text>
                      </Pressable>
                    )}
                    <Text style={{ fontSize:10, color:'#6b7280' }}>Shown publicly; keep it broad for privacy.</Text>
                  </View>
                  {locFetchError && (
                    <Text style={{ marginTop:6, color:'#b45309', fontSize:11 }}>{locFetchError}</Text>
                  )}
                </>
              ) : (
                <Text style={{ marginTop:10, fontSize:11, color:'#b45309' }}>Location field unavailable on this project.</Text>
              )}
              {supportsInstagram && (
                        <>
                          <Text style={{ marginTop:10, marginBottom:6, color: theme.colors.ink60 }}>Instagram (optional)</Text>
                          <TextInput value={draftInstagram} onChangeText={setDraftInstagram} placeholder="yourgram" autoCapitalize="none" style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb' }} />
                        </>
                      )}
                      {supportsWhatsapp && (
                        <>
                          <Text style={{ marginTop:10, marginBottom:6, color: theme.colors.ink60 }}>WhatsApp (optional, E.164)</Text>
                          <TextInput value={draftWhatsapp} onChangeText={setDraftWhatsapp} placeholder="+1234567890" keyboardType="phone-pad" style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb' }} />
                        </>
                      )}
                      {(!supportsInstagram || !supportsWhatsapp || !supportsBio) && (
                        <Text style={{ marginTop:10, fontSize:11, color:'#b45309' }}>Some fields are hidden (not in server schema).</Text>
                      )}
              <Text style={{ marginTop:12, fontSize:11, color: theme.colors.ink60 }}>Tap your avatar above to change photo.</Text>
            </ScrollView>
            <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:12, marginTop:16 }}>
              <Pressable onPress={clearDraft} disabled={loading} style={{ paddingVertical:10, paddingHorizontal:14, borderRadius:10, backgroundColor:'#f3f4f6' }}><Text style={{ color:'#374151', fontSize:12 }}>Reset Draft</Text></Pressable>
              <Pressable onPress={()=>setEditOpen(false)} style={{ paddingVertical:10, paddingHorizontal:18, borderRadius:10, backgroundColor:'#e5e7eb' }}><Text style={{ color:'#111827', fontWeight:'600' }}>Cancel</Text></Pressable>
              <Pressable onPress={saveEdits} disabled={loading} style={{ paddingVertical:10, paddingHorizontal:18, borderRadius:10, backgroundColor: theme.colors.brandTeal, opacity: loading?0.6:1 }}><Text style={{ color:'white', fontWeight:'700' }}>{loading? 'Saving…':'Save'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ marginTop:24, marginHorizontal:16 }}>
        <Text style={{ fontSize:16, fontWeight:'700', color: theme.colors.brandInk, marginBottom:10 }}>Badges</Text>
        <BadgesList items={mergedBadges} onEndorse={() => { /* endorsement UI omitted in simple mode */ }} />
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
