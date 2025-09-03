import * as Location from 'expo-location';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';

import { supabase } from '../lib/supabase';

type Option = { id: string; name: string };

export default function AddEvent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [activities, setActivities] = useState<Option[]>([]);
  const [venues, setVenues] = useState<Option[]>([]);

  const [activityId, setActivityId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [venueId, setVenueId] = useState('');
  const [venueName, setVenueName] = useState('');
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await supabase.from('activities').select('id,name').order('name');
      if (!a.error) setActivities((a.data ?? []) as Option[]);
      const v = await supabase.from('venues').select('id,name').order('name');
      if (!v.error) setVenues((v.data ?? []) as Option[]);
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') await Location.requestForegroundPermissionsAsync();
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
      if (last) { setLat(String(last.coords.latitude.toFixed(6))); setLng(String(last.coords.longitude.toFixed(6))); }
    } catch {}
      // Pre-fill from query string if provided (e.g., from Map long-press)
      if (params?.lat && params?.lng) {
        setLat(String(params.lat));
        setLng(String(params.lng));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!lat || !lng || venueName.trim()) { setSuggestedName(null); return; }
      try {
        setSuggesting(true);
        const arr = await Location.reverseGeocodeAsync({ latitude: parseFloat(lat), longitude: parseFloat(lng) });
        const best = arr?.[0];
        if (best) {
          const parts = [best.name, best.street, best.city].filter(Boolean) as string[];
          setSuggestedName(parts.join(', ').trim() || null);
        } else { setSuggestedName(null); }
      } catch { setSuggestedName(null); }
      finally { setSuggesting(false); }
    })();
  }, [lat, lng, venueName]);

  async function ensureActivity(): Promise<string> {
    if (activityId) return activityId;
    const name = activityName.trim();
    if (!name) throw new Error('Enter an activity name or choose one.');
    const { data, error } = await supabase.from('activities').insert({ name }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  }
  async function ensureVenue(): Promise<string> {
    if (venueId) return venueId;
    const name = venueName.trim();
    if (!name) throw new Error('Enter a venue name or choose one.');
    const la = parseFloat(lat); const ln = parseFloat(lng);
    const payload: any = { name };
    if (!Number.isNaN(la)) payload.lat = la;
    if (!Number.isNaN(ln)) payload.lng = ln;
    const { data, error } = await supabase.from('venues').insert(payload).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  }

  async function submit() {
    try {
      setErr(null); setMsg(null); setSaving(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; if (!uid) throw new Error('Please sign in.');
      const act = await ensureActivity();
      const ven = await ensureVenue();
      if (!startsAt || !endsAt) throw new Error('Start and end are required.');
      const cents = Math.round((Number(price) || 0) * 100);
      const { data, error } = await supabase.from('sessions').insert({
        activity_id: act,
        venue_id: ven,
        price_cents: cents,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        created_by: uid,
      }).select('id').single();
      if (error) throw error;
      setMsg('Event created');
      router.replace(`/sessions/${(data as any).id}`);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create event');
    } finally { setSaving(false); }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Link href="/" asChild><Pressable><Text style={{ color: '#0d9488' }}>&larr; Back</Text></Pressable></Link>
      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 8 }}>Create event</Text>
      {err && <Text style={{ color: '#b91c1c', marginTop: 8 }}>{err}</Text>}
      {msg && <Text style={{ color: '#065f46', marginTop: 8 }}>{msg}</Text>}

      <Text style={{ marginTop: 12, fontWeight: '600' }}>Activity</Text>
      <TextInput placeholder="Select existing activity id (optional)" value={activityId} onChangeText={setActivityId} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
      <TextInput placeholder="Or type a new activity name" value={activityName} onChangeText={setActivityName} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />

      <Text style={{ marginTop: 12, fontWeight: '600' }}>Venue</Text>
      <TextInput placeholder="Select existing venue id (optional)" value={venueId} onChangeText={setVenueId} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
      <TextInput placeholder="Or type a new venue name" value={venueName} onChangeText={setVenueName} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
      {suggestedName && (
        <Pressable onPress={() => setVenueName(suggestedName)} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          <Text style={{ color: '#0d9488' }}>Use suggested name: {suggestedName}</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <TextInput placeholder="lat" value={lat} onChangeText={setLat} inputMode="decimal" style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 8 }} />
        <TextInput placeholder="lng" value={lng} onChangeText={setLng} inputMode="decimal" style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 8 }} />
        <Pressable onPress={async ()=>{
          try {
            const perm = await Location.getForegroundPermissionsAsync();
            if (perm.status !== 'granted') await Location.requestForegroundPermissionsAsync();
            const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
            if (last) { setLat(String(last.coords.latitude.toFixed(6))); setLng(String(last.coords.longitude.toFixed(6))); }
          } catch {}
        }} style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Use my loc</Text>
        </Pressable>
      </View>

      <Text style={{ marginTop: 12, fontWeight: '600' }}>Price (EUR)</Text>
      <TextInput placeholder="15" value={price} onChangeText={setPrice} inputMode="decimal" style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />

      <Text style={{ marginTop: 12, fontWeight: '600' }}>Starts at (YYYY-MM-DD HH:mm)</Text>
      <TextInput placeholder="2025-08-12 17:00" value={startsAt} onChangeText={setStartsAt} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />
      <Text style={{ marginTop: 12, fontWeight: '600' }}>Ends at (YYYY-MM-DD HH:mm)</Text>
      <TextInput placeholder="2025-08-12 19:00" value={endsAt} onChangeText={setEndsAt} style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 }} />

      <Pressable onPress={submit} disabled={saving} style={{ marginTop: 14, backgroundColor: '#0d9488', borderRadius: 8, padding: 12, opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: 'white', textAlign: 'center' }}>{saving ? 'Creating…' : 'Create event'}</Text>
      </Pressable>
    </ScrollView>
  );
}
