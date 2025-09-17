// Simplified mobile profile screen with dynamic (lazy) avatar picking.
// Avatar URL text input removed; user taps avatar to choose a photo.
// Uses dynamic import for expo-image-picker so bundler won't fail if the
// native module is temporarily unavailable; shows a graceful error instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Link } = require('expo-router');
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, RefreshControl, Modal, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LinearGradient } = require('expo-linear-gradient');
import { theme } from '@dowhat/shared';
import { supabase } from '../lib/supabase';
import { BadgesList, MobileBadgeItem } from '../components/BadgesList';

// Shape of the profiles table (only fields we care about in this screen)
type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  updated_at?: string | null;
};

export default function ProfileSimple() {
  console.log('[ProfileSimple] Mounted');
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<any[]>([]);
  const [catalogBadges, setCatalogBadges] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftFullName, setDraftFullName] = useState('');
  // Draft state excludes avatar now (avatar picked directly, saves immediately)
  const [draftInstagram, setDraftInstagram] = useState('');
  const [draftWhatsapp, setDraftWhatsapp] = useState('');
  const DRAFT_KEY = 'profile_edit_draft_v1_simple';
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const imagePickerRef = useRef<any | null>(null); // cache dynamic module
  // Feature flags discovered at runtime (schema / native capabilities)
  const [supportsInstagram, setSupportsInstagram] = useState(true);
  const [supportsWhatsapp, setSupportsWhatsapp] = useState(true);

  const mergeBadges = useCallback((): MobileBadgeItem[] => {
    if (!catalogBadges.length) return ownedBadges as any;
    const ownedMap = new Map(ownedBadges.map((b:any)=>[b.badge_id, b]));
    return catalogBadges.map((c:any) => {
      if (c.owned && c.owned.badge_id) {
        const ob = ownedMap.get(c.catalog.id) || c.owned;
        return { id: ob.id, badge_id: c.catalog.id, status: ob.status || 'unverified', badges: c.catalog, locked: false } as MobileBadgeItem;
      }
      return { badge_id: c.catalog.id, status: 'unverified', badges: c.catalog, locked: true } as MobileBadgeItem;
    });
  }, [catalogBadges, ownedBadges]);

  const loadBadges = useCallback(async (uid: string) => {
    try {
      const base = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:3002';
      const [ownedRes, catalogRes] = await Promise.all([
        fetch(`${base}/api/users/${uid}/badges`, { credentials: 'include' }),
        fetch(`${base}/api/badges/catalog`, { credentials: 'include' }),
      ]);
      if (ownedRes.ok) { const j = await ownedRes.json(); setOwnedBadges(j.badges || []); }
      if (catalogRes.ok) { const j = await catalogRes.json(); setCatalogBadges(j.badges || []); }
    } catch {/* ignore */}
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (uid) await loadBadges(uid);
    } finally { setRefreshing(false); }
  }, [loadBadges]);

  // Centralized profile fetch so we can reuse after mutations & auth events
  const fetchProfile = useCallback(async (uid: string) => {
    // Build dynamic column list based on current support flags
    const cols = ['full_name', 'avatar_url']
      .concat(supportsInstagram ? ['instagram'] : [])
      .concat(supportsWhatsapp ? ['whatsapp'] : []);
    const { data, error } = await supabase
      .from('profiles')
      .select(cols.join(', '))
      .eq('id', uid)
      .maybeSingle();
    let row: Partial<ProfileRow> | null | undefined = data as any;
    if (error) {
      const msg = error.message || '';
      // Detect missing column(s) and downgrade support flags then retry once
      let retried = false;
      if (msg.includes('instagram')) { setSupportsInstagram(false); retried = true; }
      if (msg.includes('whatsapp')) { setSupportsWhatsapp(false); retried = true; }
      if (retried) {
        const retryCols = ['full_name', 'avatar_url']
          .concat(supportsInstagram && !msg.includes('instagram') ? ['instagram'] : [])
          .concat(supportsWhatsapp && !msg.includes('whatsapp') ? ['whatsapp'] : []);
        const retry = await supabase
          .from('profiles')
          .select(retryCols.join(', '))
          .eq('id', uid)
          .maybeSingle();
        row = retry.data as any;
      } else {
        // Only surface errors that are not missing-column related
        if (!/could not find the .* column/i.test(msg)) setErr(msg);
      }
    }
    setFullName((row?.full_name as string) || '');
    const rawAvatar = (row?.avatar_url as string) || '';
    setAvatarUrl(rawAvatar ? `${rawAvatar}?v=${Date.now()}` : '');
    if (supportsInstagram) setInstagram((row?.instagram as string) || '');
    if (supportsWhatsapp) setWhatsapp((row?.whatsapp as string) || '');
  }, [supportsInstagram, supportsWhatsapp]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setEmail(auth?.user?.email ?? null);
      if (uid) {
        await fetchProfile(uid);
        await loadBadges(uid);
      }
      // Listen for future sign-ins (e.g., after a logout/login cycle) and refetch
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          setEmail(session.user.email ?? null);
          await fetchProfile(session.user.id);
          await loadBadges(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setEmail(null);
          setFullName('');
          setAvatarUrl('');
          setInstagram('');
          setWhatsapp('');
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
    setMsg(null); setErr(null);
    (async () => {
      try { const raw = await AsyncStorage.getItem(DRAFT_KEY); if (raw) { const d = JSON.parse(raw); setDraftFullName(d.fullName||''); setDraftInstagram(d.instagram||''); setDraftWhatsapp(d.whatsapp||''); } } catch {/* ignore */}
      setEditOpen(true);
    })();
  }

  function applyDraftsToState() {
    setFullName(draftFullName); setInstagram(draftInstagram); setWhatsapp(draftWhatsapp);
  }

  async function saveEdits() {
    setErr(null); setMsg(null); setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (!uid) throw new Error('Please sign in first.');
      const cleanInstagram = (v:string) => { let val=(v||'').trim(); if(!val) return ''; val=val.replace(/@/g,'').replace(/^https?:\/\/([^/]*instagram\.com)\//i,'').replace(/^instagram\.com\//i,'').replace(/^www\.instagram\.com\//i,''); val=val.split(/[?#]/)[0].replace(/\/+$/,''); return val.slice(0,50); };
      const cleanWhatsApp = (v:string) => { let val=(v||'').trim(); if(!val) return ''; val=val.replace(/^https?:\/\/wa\.me\//i,'').replace(/^https?:\/\/api\.whatsapp\.com\/send\?phone=/i,'').replace(/^wa\.me\//i,'').replace(/^api\.whatsapp\.com\/send\?phone=/i,''); val=val.replace(/[^+\d]/g,''); val=val.replace(/^(\++)/,'+'); if (val.startsWith('+')) { val='+'+val.slice(1).replace(/\D/g,'').slice(0,15); } else { val=val.replace(/\D/g,'').slice(0,15); } return val; };
      // Build only supported + non-empty fields
      const upsert: Record<string, any> = { id: uid, full_name: draftFullName.trim()||null, avatar_url: avatarUrl || null, updated_at: new Date().toISOString() };
      if (supportsInstagram) upsert.instagram = cleanInstagram(draftInstagram)||null;
      if (supportsWhatsapp) upsert.whatsapp = cleanWhatsApp(draftWhatsapp)||null;
      const { error } = await supabase.from('profiles').upsert(upsert, { onConflict: 'id' });
      if (error) {
        const msg = error.message || '';
        let retried = false;
        if (msg.includes('instagram')) { setSupportsInstagram(false); delete upsert.instagram; retried = true; }
        if (msg.includes('whatsapp')) { setSupportsWhatsapp(false); delete upsert.whatsapp; retried = true; }
        if (retried) {
          const retry = await supabase.from('profiles').upsert(upsert, { onConflict: 'id' });
          if (retry.error) throw retry.error;
        } else {
          throw error;
        }
      }
  applyDraftsToState();
  // Refetch from server to ensure we show canonical persisted values (especially if triggers modify data)
  if (uid) await fetchProfile(uid);
  setMsg('Saved');
      try { await AsyncStorage.removeItem(DRAFT_KEY); } catch {}
      setDraftSavedAt(null); setEditOpen(false);
    } catch(e:any) { setErr(e.message||'Failed to save'); } finally { setLoading(false); }
  }

  // Draft persistence
  useEffect(() => {
    if (!editOpen) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(async () => {
      try { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ fullName: draftFullName, instagram: draftInstagram, whatsapp: draftWhatsapp })); setDraftSavedAt(Date.now()); } catch {}
    }, 400);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [draftFullName, draftInstagram, draftWhatsapp, editOpen]);

  function clearDraft() {
    setDraftFullName(fullName); setDraftInstagram(instagram); setDraftWhatsapp(whatsapp);
    AsyncStorage.removeItem(DRAFT_KEY).catch(()=>{}); setDraftSavedAt(null);
  }

  async function ensureImagePicker() {
    if (imagePickerRef.current) return imagePickerRef.current;
    try {
      // Check for native module presence BEFORE importing to avoid fatal red screen
      const { NativeModulesProxy } = await import('expo-modules-core');
      const hasNative = 'ExponentImagePicker' in (NativeModulesProxy as any) || 'ExpoImagePicker' in (NativeModulesProxy as any);
      if (!hasNative) {
        throw new Error('Image picker native module missing. Rebuild dev client (expo prebuild && expo run:ios) after adding expo-image-picker.');
      }
      const mod = await import('expo-image-picker');
      try { console.log('[ProfileSimple] expo-image-picker keys:', Object.keys(mod)); } catch {}
      imagePickerRef.current = mod;
      return mod;
    } catch (e:any) {
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
      if (!ImagePicker || (!ImagePicker.launchImageLibraryAsync && !(ImagePicker as any).launchImageLibraryAsync)) {
        throw new Error('Image picker native module missing. Rebuild dev client after adding expo-image-picker.');
      }
      let permStatus: string | undefined;
      try {
        if (typeof ImagePicker.requestMediaLibraryPermissionsAsync === 'function') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          permStatus = perm?.status;
        } else if (typeof (ImagePicker as any).requestCameraRollPermissionsAsync === 'function') {
          // Legacy name fallback (very old SDKs)
          const perm = await (ImagePicker as any).requestCameraRollPermissionsAsync();
          permStatus = perm?.status;
        } else {
          console.warn('[ProfileSimple] No media library permission function found on expo-image-picker');
        }
      } catch (permErr:any) {
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
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
      const path = `${uid}.${ext}`;
      const storage = supabase.storage.from('avatars');
      // Upsert behavior: try remove old then upload (or use update if supported)
      await storage.remove([path]).catch(()=>{});
      const { error: upErr } = await storage.upload(path, blob, { contentType: asset.mimeType || 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = storage.getPublicUrl(path);
      if (pub?.publicUrl) {
        setAvatarUrl(pub.publicUrl + `?t=${Date.now()}`);
        // Persist immediately
  const { error: profErr } = await supabase.from('profiles').upsert({ id: uid, avatar_url: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' });
        if (profErr) throw profErr;
  // Re-fetch to harmonize with any database-side transformations
  await fetchProfile(uid);
  setMsg('Avatar updated');
      }
    } catch (e:any) {
      setErr(e.message || 'Avatar update failed');
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
                      {(!supportsInstagram || !supportsWhatsapp) && (
                        <Text style={{ marginTop:10, fontSize:11, color:'#b45309' }}>Some social fields are hidden (not in server schema).</Text>
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
        <BadgesList items={mergeBadges() as any} onEndorse={()=>{ /* endorsement UI omitted in simple mode */ }} />
      </View>
    </ScrollView>
  );
}
