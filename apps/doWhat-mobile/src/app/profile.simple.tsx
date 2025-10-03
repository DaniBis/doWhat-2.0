// Simplified mobile profile screen with dynamic (lazy) avatar picking.
// Avatar URL text input removed; user taps avatar to choose a photo.
// Uses dynamic import for expo-image-picker so bundler won't fail if the
// native module is temporarily unavailable; shows a graceful error instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, RefreshControl, Modal, ActivityIndicator, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
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

const BADGE_STATUS_VALUES: readonly BadgeStatus[] = ['unverified', 'verified', 'expired'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
  const DRAFT_KEY = 'profile_edit_draft_v1_simple';
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const imagePickerRef = useRef<ImagePickerModule | null>(null); // cache dynamic module
  // Feature flags discovered at runtime (schema / native capabilities)
  const [supportsInstagram, setSupportsInstagram] = useState(true);
  const [supportsWhatsapp, setSupportsWhatsapp] = useState(true);
  const [supportsBio, setSupportsBio] = useState(true);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (uid) await loadBadges(uid);
    } finally { setRefreshing(false); }
  }, [loadBadges]);

  // Centralized profile fetch so we can reuse after mutations & auth events
  const fetchProfile = useCallback(async (uid: string, options?: { fallbackBio?: string | null }) => {
    const fallbackBio = typeof options?.fallbackBio === 'string' ? options.fallbackBio : '';
    const buildColumns = (includeInstagram: boolean, includeWhatsapp: boolean, includeBio: boolean) => {
      const baseColumns = ['full_name', 'avatar_url'];
      if (includeInstagram) baseColumns.push('instagram');
      if (includeWhatsapp) baseColumns.push('whatsapp');
      if (includeBio) baseColumns.push('bio');
      return baseColumns;
    };

    const requestedColumns = buildColumns(supportsInstagram, supportsWhatsapp, supportsBio);
    const { data, error } = await supabase
      .from('profiles')
      .select(requestedColumns.join(', '))
      .eq('id', uid)
      .maybeSingle<ProfileRow>();

    let nextSupportsInstagram = supportsInstagram;
    let nextSupportsWhatsapp = supportsWhatsapp;
    let nextSupportsBio = supportsBio;
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
      if (retried) {
        const fallbackColumns = buildColumns(nextSupportsInstagram, nextSupportsWhatsapp, nextSupportsBio);
        const retry = await supabase
          .from('profiles')
          .select(fallbackColumns.join(', '))
          .eq('id', uid)
          .maybeSingle<ProfileRow>();
        if (retry.error) throw retry.error;
        row = retry.data ?? null;
      } else if (!/could not find the .* column/i.test(message)) {
        setErr(message);
      }
    }

    if (nextSupportsInstagram !== supportsInstagram) setSupportsInstagram(nextSupportsInstagram);
    if (nextSupportsWhatsapp !== supportsWhatsapp) setSupportsWhatsapp(nextSupportsWhatsapp);
    if (nextSupportsBio !== supportsBio) setSupportsBio(nextSupportsBio);

    setFullName(row?.full_name ?? '');
    const rawAvatar = row?.avatar_url ?? '';
    setAvatarUrl(rawAvatar ? `${rawAvatar}?v=${Date.now()}` : '');
    setInstagram(nextSupportsInstagram ? row?.instagram ?? '' : '');
    setWhatsapp(nextSupportsWhatsapp ? row?.whatsapp ?? '' : '');
    setBio(nextSupportsBio ? row?.bio ?? '' : fallbackBio);
  }, [supportsInstagram, supportsWhatsapp, supportsBio]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setEmail(auth?.user?.email ?? null);
      const fallbackBio = typeof auth?.user?.user_metadata?.bio === 'string' ? auth.user.user_metadata.bio : '';
      if (uid) {
        await fetchProfile(uid, { fallbackBio });
        await loadBadges(uid);
      }
      // Listen for future sign-ins (e.g., after a logout/login cycle) and refetch
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          setEmail(session.user.email ?? null);
          const metaBio = typeof session.user.user_metadata?.bio === 'string' ? session.user.user_metadata?.bio : '';
          await fetchProfile(session.user.id, { fallbackBio: metaBio });
          await loadBadges(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setEmail(null);
          setFullName('');
          setAvatarUrl('');
          setInstagram('');
          setWhatsapp('');
          setBio('');
        }
      });
      unsub = () => listener.subscription.unsubscribe();
    })();
    return () => { if (unsub) unsub(); };
  }, [fetchProfile, loadBadges]);

  function openEdit() {
    setDraftFullName(fullName);
    setDraftInstagram(instagram);
    setDraftWhatsapp(whatsapp);
    setDraftBio(bio);
    setMsg(null); setErr(null);
    (async () => {
      try { const raw = await AsyncStorage.getItem(DRAFT_KEY); if (raw) { const d = JSON.parse(raw); setDraftFullName(d.fullName||''); setDraftInstagram(d.instagram||''); setDraftWhatsapp(d.whatsapp||''); setDraftBio(d.bio||''); } } catch {/* ignore */}
      setEditOpen(true);
    })();
  }

  function applyDraftsToState() {
    setFullName(draftFullName); setInstagram(draftInstagram); setWhatsapp(draftWhatsapp); setBio(draftBio);
  }

  async function saveEdits() {
    setErr(null); setMsg(null); setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (!uid) throw new Error('Please sign in first.');
      const cleanInstagram = (v:string) => { let val=(v||'').trim(); if(!val) return ''; val=val.replace(/@/g,'').replace(/^https?:\/\/([^/]*instagram\.com)\//i,'').replace(/^instagram\.com\//i,'').replace(/^www\.instagram\.com\//i,''); val=val.split(/[?#]/)[0].replace(/\/+$/,''); return val.slice(0,50); };
      const cleanWhatsApp = (v:string) => { let val=(v||'').trim(); if(!val) return ''; val=val.replace(/^https?:\/\/wa\.me\//i,'').replace(/^https?:\/\/api\.whatsapp\.com\/send\?phone=/i,'').replace(/^wa\.me\//i,'').replace(/^api\.whatsapp\.com\/send\?phone=/i,''); val=val.replace(/[^+\d]/g,''); val=val.replace(/^(\++)/,'+'); if (val.startsWith('+')) { val='+'+val.slice(1).replace(/\D/g,'').slice(0,15); } else { val=val.replace(/\D/g,'').slice(0,15); } return val; };
      // Build only supported + non-empty fields
      const cleanAvatarUrl = avatarUrl ? avatarUrl.split('?')[0] : null;
      const sanitizedBio = (draftBio ?? '').toString().slice(0, 500);
      const normalizedBio = sanitizedBio;

      const basePayload: ProfileUpdatePayload = {
        id: uid,
        full_name: draftFullName.trim() || null,
        avatar_url: cleanAvatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error: baseError } = await supabase.from('profiles').upsert(basePayload, { onConflict: 'id' });
      if (baseError) throw baseError;

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

      applyDraftsToState();
      // Refetch from server to ensure we show canonical persisted values (especially if triggers modify data)
      try {
        await supabase.auth.updateUser({
          data: {
            bio: metadataFallback.bio || null,
            instagram: metadataFallback.instagram || null,
            whatsapp: metadataFallback.whatsapp || null,
          },
        });
      } catch (metaError) {
        console.warn('[ProfileSimple] Failed to persist metadata fallback', metaError);
      }

      if (uid) await fetchProfile(uid, { fallbackBio: metadataFallback.bio || null });
      setMsg('Saved');
      try { await AsyncStorage.removeItem(DRAFT_KEY); } catch {}
      setDraftSavedAt(null); setEditOpen(false);
    } catch (error) {
      const message = error instanceof Error ? (error.message || 'Failed to save profile.') : 'Failed to save profile.';
      console.error('[ProfileSimple] saveEdits failed', error);
      setErr(message);
    } finally { setLoading(false); }
  }

  // Draft persistence
  useEffect(() => {
    if (!editOpen) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(async () => {
      try { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ fullName: draftFullName, instagram: draftInstagram, whatsapp: draftWhatsapp, bio: draftBio })); setDraftSavedAt(Date.now()); } catch {}
    }, 400);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [draftFullName, draftInstagram, draftWhatsapp, draftBio, editOpen]);

  function clearDraft() {
  setDraftFullName(fullName); setDraftInstagram(instagram); setDraftWhatsapp(whatsapp); setDraftBio(bio);
  AsyncStorage.removeItem(DRAFT_KEY).catch(()=>{}); setDraftSavedAt(null);
  }

  async function ensureImagePicker(): Promise<ImagePickerModule> {
    if (imagePickerRef.current) return imagePickerRef.current;
    try {
      // Check for native module presence BEFORE importing to avoid fatal red screen
      const { NativeModulesProxy } = await import('expo-modules-core');
      const modules = NativeModulesProxy as Record<string, unknown>;
      const hasNative = 'ExponentImagePicker' in modules || 'ExpoImagePicker' in modules;
      if (!hasNative) {
        throw new Error('Image picker native module missing. Rebuild dev client (expo prebuild && expo run:ios) after adding expo-image-picker.');
      }
      const mod: ImagePickerModule = await import('expo-image-picker');
      try { console.log('[ProfileSimple] expo-image-picker keys:', Object.keys(mod)); } catch {}
      imagePickerRef.current = mod;
      return mod;
    } catch {
      throw new Error('Image picker unavailable (module failed to load)');
    }
  }

  async function pickAvatar() {
    setErr(null); setMsg(null);
    try {
      setAvatarUploading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (!uid) throw new Error('Sign in first.');
      const ImagePicker = await ensureImagePicker();
      // If native side missing, surface clear rebuild instruction
      if (typeof ImagePicker.launchImageLibraryAsync !== 'function') {
        throw new Error('Image picker native module missing. Rebuild dev client after adding expo-image-picker.');
      }
      let permStatus: string | undefined;
      try {
        if (typeof ImagePicker.requestMediaLibraryPermissionsAsync === 'function') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          permStatus = perm?.status;
        } else if ('requestCameraRollPermissionsAsync' in ImagePicker &&
          typeof (ImagePicker as ImagePickerModule & { requestCameraRollPermissionsAsync?: () => Promise<{ status: string }> }).requestCameraRollPermissionsAsync === 'function') {
          // Legacy name fallback (very old SDKs)
          const perm = await (ImagePicker as ImagePickerModule & { requestCameraRollPermissionsAsync?: () => Promise<{ status: string }> }).requestCameraRollPermissionsAsync!();
          permStatus = perm?.status;
        } else {
          console.warn('[ProfileSimple] No media library permission function found on expo-image-picker');
        }
      } catch (permErr) {
        console.warn('[ProfileSimple] Permission request threw', permErr);
      }
      if (permStatus !== 'granted') throw new Error('Permission denied');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.8 });
      if (res.canceled || !res.assets?.length) { setAvatarUploading(false); return; }
      const asset = res.assets[0];
      // Upload to Supabase storage bucket 'avatars'
      const uri = asset.uri;
      const fileResp = await fetch(uri);
      const blob = await fileResp.blob();
      const filenameSource = asset.fileName || asset.uri.split('/').pop() || 'avatar.jpg';
      const ext = filenameSource.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${uid}.${ext}`;
      const storage = supabase.storage.from('avatars');
      // Upsert behavior: try remove old then upload (or use update if supported)
      await storage.remove([path]).catch(() => {});
      const { error: upErr } = await storage.upload(path, blob, { contentType: asset.mimeType || 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = storage.getPublicUrl(path);
      if (pub?.publicUrl) {
        setAvatarUrl(pub.publicUrl + `?t=${Date.now()}`);
        // Persist immediately
        const { error: profErr } = await supabase
          .from('profiles')
          .upsert({ id: uid, avatar_url: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' });
        if (profErr) throw profErr;
        // Re-fetch to harmonize with any database-side transformations
        await fetchProfile(uid);
        setMsg('Avatar updated');
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Avatar update failed');
    } finally {
      setAvatarUploading(false);
    }
  }

  const mergedBadges = mergeBadges();

  return (
    <ScrollView style={{ flex:1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }>
      <LinearGradient colors={[theme.colors.brandTeal, theme.colors.brandTealDark]} style={{ paddingTop:16, paddingBottom:24, paddingHorizontal:16, borderBottomLeftRadius:24, borderBottomRightRadius:24 }}>
        <Link href="/" asChild><Pressable><Text style={{ color:'white' }}>&larr; Home</Text></Pressable></Link>
        <View style={{ flexDirection:'row', alignItems:'center', marginTop:16, gap:12 }}>
          <Pressable onPress={pickAvatar} style={{ width:72, height:72, borderRadius:36, backgroundColor:'#fff', overflow:'hidden', alignItems:'center', justifyContent:'center' }}>
            {avatarUploading ? (<ActivityIndicator />) : avatarUrl ? (<Image source={{ uri: avatarUrl }} style={{ width:'100%', height:'100%' }} />) : (<Text style={{ fontSize:32 }}>🙂</Text>)}
            <View style={{ position:'absolute', bottom:0, width:'100%', backgroundColor:'rgba(0,0,0,0.45)', paddingVertical:2 }}>
              <Text style={{ color:'white', fontSize:10, textAlign:'center' }}>{avatarUploading ? 'Uploading' : 'Change'}</Text>
            </View>
          </Pressable>
          <View style={{ flex:1 }}>
            <Text style={{ color:'white', fontSize:20, fontWeight:'800' }}>{fullName || 'Your name'}</Text>
            {!!email && <Text style={{ color:'white', opacity:0.9 }}>{email}</Text>}
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
