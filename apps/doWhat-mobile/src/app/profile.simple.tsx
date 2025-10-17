// Simplified mobile profile screen with dynamic (lazy) avatar picking.
// Avatar URL text input removed; user taps avatar to choose a photo.
// Uses dynamic import for expo-image-picker so bundler won't fail if the
// native module is temporarily unavailable; shows a graceful error instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, RefreshControl, Modal, ActivityIndicator, Linking, Platform, ActionSheetIOS, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
import * as Location from 'expo-location';
import { theme } from '@dowhat/shared';
import type { BadgeStatus } from '@dowhat/shared';
import { supabase } from '../lib/supabase';
import { createWebUrl } from '../lib/web';
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
  last_lat: number | null;
  last_lng: number | null;
  updated_at?: string | null;
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
  const presentationStyle = (picker as ImagePickerModule & { UIImagePickerPresentationStyle?: { FULL_SCREEN?: string } }).UIImagePickerPresentationStyle?.FULL_SCREEN;
  const baseOptions = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8, copyToCacheDirectory: true } as const;
  if (source === 'library') {
    if (typeof picker.launchImageLibraryAsync !== 'function') {
      throw new Error('Image picker native module missing. Rebuild dev client after adding expo-image-picker.');
    }
    return picker.launchImageLibraryAsync({ mediaTypes: picker.MediaTypeOptions.Images, presentationStyle, ...baseOptions });
  }
  if (typeof picker.launchCameraAsync !== 'function') {
    throw new Error('Camera picker not available on this build.');
  }
  return picker.launchCameraAsync({ ...baseOptions, presentationStyle: undefined, mediaTypes: picker.MediaTypeOptions?.Images ?? undefined } as any);
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
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [bio, setBio] = useState('');
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
  const DRAFT_KEY = 'profile_edit_draft_v1_simple';
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const imagePickerRef = useRef<ImagePickerModule | null>(null); // cache dynamic module
  const avatarDropRef = useRef<any>(null);
  const [avatarDropActive, setAvatarDropActive] = useState(false);
  // Feature flags discovered at runtime (schema / native capabilities)
  const [supportsInstagram, setSupportsInstagram] = useState(true);
  const [supportsWhatsapp, setSupportsWhatsapp] = useState(true);
  const [supportsBio, setSupportsBio] = useState(true);
  const [supportsLocation, setSupportsLocation] = useState(true);
  const [locFetchBusy, setLocFetchBusy] = useState(false);
  const [locFetchError, setLocFetchError] = useState<string | null>(null);
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
  const fetchProfile = useCallback(async (uid: string, options?: { fallbackBio?: string | null }) => {
    const fallbackBio = typeof options?.fallbackBio === 'string' ? options.fallbackBio : '';
    const buildColumns = (includeInstagram: boolean, includeWhatsapp: boolean, includeBio: boolean, includeLocation: boolean) => {
      const baseColumns = ['full_name', 'avatar_url'];
      if (includeInstagram) baseColumns.push('instagram');
      if (includeWhatsapp) baseColumns.push('whatsapp');
      if (includeBio) baseColumns.push('bio');
      if (includeLocation) baseColumns.push('location');
      baseColumns.push('last_lat', 'last_lng');
      return baseColumns;
    };

    let nextSupportsInstagram = supportsInstagram;
    let nextSupportsWhatsapp = supportsWhatsapp;
    let nextSupportsBio = supportsBio;
    let nextSupportsLocation = supportsLocation;

    setErr(null);

    try {
      const requestedColumns = Array.from(new Set(buildColumns(nextSupportsInstagram, nextSupportsWhatsapp, nextSupportsBio, nextSupportsLocation)));
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
        if (retried) {
          const fallbackColumns = buildColumns(nextSupportsInstagram, nextSupportsWhatsapp, nextSupportsBio, nextSupportsLocation);
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
      if (nextSupportsLocation !== supportsLocation) setSupportsLocation(nextSupportsLocation);

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
        last_lat: typeof row?.last_lat === 'number' ? row.last_lat : profileLat,
        last_lng: typeof row?.last_lng === 'number' ? row.last_lng : profileLng,
        updated_at: row?.updated_at ?? null,
      };

      setFullName(resolved.full_name);
      setAvatarUrl(resolved.avatar_url ? `${resolved.avatar_url}?v=${Date.now()}` : '');
      setInstagram(resolved.instagram);
      setWhatsapp(resolved.whatsapp);
      setBio(resolved.bio);
      setLocationLabel(resolved.location);
      setProfileLat(resolved.last_lat ?? null);
      setProfileLng(resolved.last_lng ?? null);

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
  }, [supportsInstagram, supportsWhatsapp, supportsBio, supportsLocation, instagram, whatsapp, bio, locationLabel, profileLat, profileLng]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        await Promise.all([
          fetchProfile(uid, { fallbackBio: bio }),
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
        await fetchProfile(uid, { fallbackBio });
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
          await fetchProfile(signedInId, { fallbackBio: metaBio });
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
          setDraftLocation('');
          setLocFetchError(null);
          setLocFetchBusy(false);
        }
      });
      unsub = () => listener.subscription.unsubscribe();
    })();
    return () => { if (unsub) unsub(); };
  }, [fetchProfile, loadBadges, restoreProfileFromCache]);

  function openEdit() {
    setDraftFullName(fullName);
    setDraftInstagram(instagram);
    setDraftWhatsapp(whatsapp);
    setDraftBio(bio);
    setDraftLocation(locationLabel);
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
          setDraftLocation(d.location || '');
        }
      } catch {/* ignore */}
      setEditOpen(true);
    })();
  }

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
      const existingLocation = locationLabel || '';
      let canUseLocation = supportsLocation;

      let finalLocationLabel = rawLocationInput;
      let locationLat = profileLat ?? null;
      let locationLng = profileLng ?? null;

      const shouldGeocode = rawLocationInput
        ? rawLocationInput !== existingLocation || locationLat == null || locationLng == null
        : true;

      if (rawLocationInput && shouldGeocode) {
        try {
          const geocodeUrl = createWebUrl(`/api/geocode?q=${encodeURIComponent(rawLocationInput)}`);
          const res = await fetch(geocodeUrl.toString());
          if (res.ok) {
            const payload = await res.json() as { label?: string; lat?: number; lng?: number };
            if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
              locationLat = payload.lat;
              locationLng = payload.lng;
            }
            if (payload.label) {
              finalLocationLabel = payload.label;
            }
          } else {
            setLocFetchError('Unable to find that location. Saved without map focus.');
          }
        } catch (geoError) {
          console.warn('[ProfileSimple] forward geocode failed', geoError);
          setLocFetchError('Unable to find that location. Saved without map focus.');
        }
      } else if (!rawLocationInput) {
        locationLat = null;
        locationLng = null;
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
      } catch (baseError: any) {
        const message = typeof baseError?.message === 'string' ? baseError.message.toLowerCase() : '';
        if (canUseLocation && /last_(lat|lng)/.test(message)) {
          canUseLocation = false;
          setSupportsLocation(false);
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
          disable: () => { canUseLocation = false; setSupportsLocation(false); },
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
  AsyncStorage.removeItem(DRAFT_KEY).catch(()=>{}); setDraftSavedAt(null);
  }

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
      try {
        const geocodeUrl = createWebUrl(`/api/geocode?lat=${latitude}&lng=${longitude}`);
        const response = await fetch(geocodeUrl.toString());
        if (response.ok) {
          const payload = await response.json();
          if (payload?.label && typeof payload.label === 'string') {
            label = payload.label;
          }
        }
      } catch (geoError) {
        console.info('[ProfileSimple] reverse geocode failed', geoError);
      }
      setDraftLocation(label);
      setLocFetchError(null);
    } catch (error) {
      setLocFetchError(describeError(error, 'Unable to fetch your location.'));
    } finally {
      setLocFetchBusy(false);
    }
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
        webFile?: any;
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
    const node = avatarDropRef.current as any;
    if (!node) return;

    const handleDragOver = (event: any) => {
      event.preventDefault();
      setAvatarDropActive(true);
    };

    const handleDragLeave = () => {
      setAvatarDropActive(false);
    };

    const handleDrop = async (event: any) => {
      event.preventDefault();
      setAvatarDropActive(false);
      const files = event.dataTransfer?.files;
      if (!files || !files.length) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) {
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

    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);

    return () => {
      node.removeEventListener('dragover', handleDragOver);
      node.removeEventListener('dragleave', handleDragLeave);
      node.removeEventListener('drop', handleDrop);
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
    <ScrollView style={{ flex:1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }>
      <LinearGradient colors={[theme.colors.brandTeal, theme.colors.brandTealDark]} style={{ paddingTop:16, paddingBottom:24, paddingHorizontal:16, borderBottomLeftRadius:24, borderBottomRightRadius:24 }}>
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
  <Pressable onPress={openEdit} style={{ alignSelf:'flex-start', backgroundColor: theme.colors.brandTeal, paddingVertical:10, paddingHorizontal:18, borderRadius:999 }}>
          <Text style={{ color:'white', fontWeight:'600' }}>Edit Profile</Text>
        </Pressable>
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
                    onChangeText={(value) => setDraftLocation(value.slice(0, 120))}
                    placeholder="City, neighbourhood, or leave blank"
                    style={{ borderWidth:1, borderRadius:10, padding:10, borderColor:'#e5e7eb' }}
                  />
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
                        onPress={() => { setDraftLocation(''); setLocFetchError(null); }}
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
  );
}
