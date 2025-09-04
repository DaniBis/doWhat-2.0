import * as Location from 'expo-location';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';

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
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');

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
        if (last) { 
          setLat(String(last.coords.latitude.toFixed(6))); 
          setLng(String(last.coords.longitude.toFixed(6))); 
        }
      } catch {}
      
      // Pre-fill from query string if provided (e.g., from Map long-press)
      if (params?.lat && params?.lng) {
        setLat(String(params.lat));
        setLng(String(params.lng));
      }

      // Set default date/time to tomorrow at 6 PM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      setStartsAt(tomorrow.toISOString().slice(0, 16));
      
      const endTime = new Date(tomorrow);
      endTime.setHours(20, 0, 0, 0);
      setEndsAt(endTime.toISOString().slice(0, 16));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!lat || !lng || venueName.trim()) { setSuggestedName(null); return; }
      try {
        const arr = await Location.reverseGeocodeAsync({ latitude: parseFloat(lat), longitude: parseFloat(lng) });
        const best = arr?.[0];
        if (best) {
          const parts = [best.name, best.street, best.city].filter(Boolean) as string[];
          setSuggestedName(parts.join(', ').trim() || null);
        } else { setSuggestedName(null); }
      } catch { setSuggestedName(null); }
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
      if (!startsAt || !endsAt) throw new Error('Start and end times are required.');
      
      const cents = Math.round((Number(price) || 0) * 100);
      const payload: any = {
        activity_id: act,
        venue_id: ven,
        price_cents: cents,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        created_by: uid,
      };
      
      if (description.trim()) {
        payload.description = description.trim();
      }
      
      const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
      if (error) throw error;
      
      setMsg('Event created successfully!');
      Alert.alert('Success', 'Event created successfully!', [
        { text: 'OK', onPress: () => router.replace(`/sessions/${(data as any).id}`) }
      ]);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create event');
    } finally { setSaving(false); }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Link href="/" asChild>
        <Pressable style={{ marginBottom: 16 }}>
          <Text style={{ color: '#0d9488', fontSize: 16 }}>← Back to Home</Text>
        </Pressable>
      </Link>
      
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Create Event</Text>
      <Text style={{ color: '#6b7280', marginBottom: 16 }}>
        Share what you're planning and invite others to join!
      </Text>
      
      {err && (
        <View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: '#b91c1c' }}>{err}</Text>
        </View>
      )}
      {msg && (
        <View style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: '#065f46' }}>{msg}</Text>
        </View>
      )}

      {/* Activity Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Activity *</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>What are you planning?</Text>
        
        {activities.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 4 }}>Choose existing:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {activities.slice(0, 10).map((activity) => (
                <Pressable
                  key={activity.id}
                  onPress={() => {
                    setActivityId(activity.id);
                    setActivityName('');
                  }}
                  style={{
                    backgroundColor: activityId === activity.id ? '#0d9488' : '#f3f4f6',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ color: activityId === activity.id ? 'white' : '#374151', fontSize: 14 }}>
                    {activity.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        
        <TextInput
          placeholder="Or create new activity (e.g., 'Beach Volleyball')"
          value={activityName}
          onChangeText={(text) => {
            setActivityName(text);
            if (text) setActivityId('');
          }}
          style={{
            borderWidth: 1,
            borderColor: activityId ? '#d1d5db' : '#0d9488',
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            backgroundColor: activityId ? '#f9fafb' : 'white',
          }}
          editable={!activityId}
        />
      </View>

      {/* Venue Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Venue *</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Where will this happen?</Text>
        
        {venues.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 4 }}>Choose existing:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {venues.slice(0, 10).map((venue) => (
                <Pressable
                  key={venue.id}
                  onPress={() => {
                    setVenueId(venue.id);
                    setVenueName('');
                  }}
                  style={{
                    backgroundColor: venueId === venue.id ? '#0d9488' : '#f3f4f6',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ color: venueId === venue.id ? 'white' : '#374151', fontSize: 14 }}>
                    {venue.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        
        <TextInput
          placeholder="Or create new venue (e.g., 'Central Park')"
          value={venueName}
          onChangeText={(text) => {
            setVenueName(text);
            if (text) setVenueId('');
          }}
          style={{
            borderWidth: 1,
            borderColor: venueId ? '#d1d5db' : '#0d9488',
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            backgroundColor: venueId ? '#f9fafb' : 'white',
            marginBottom: 8,
          }}
          editable={!venueId}
        />
        
        {suggestedName && !venueId && (
          <Pressable 
            onPress={() => setVenueName(suggestedName)} 
            style={{ alignSelf: 'flex-start', marginBottom: 8 }}
          >
            <Text style={{ color: '#0d9488', fontSize: 14 }}>
              💡 Use suggested: {suggestedName}
            </Text>
          </Pressable>
        )}
        
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            placeholder="Latitude"
            value={lat}
            onChangeText={setLat}
            inputMode="decimal"
            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 14 }}
          />
          <TextInput
            placeholder="Longitude"
            value={lng}
            onChangeText={setLng}
            inputMode="decimal"
            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 14 }}
          />
          <Pressable
            onPress={async () => {
              try {
                const perm = await Location.getForegroundPermissionsAsync();
                if (perm.status !== 'granted') await Location.requestForegroundPermissionsAsync();
                const current = await Location.getCurrentPositionAsync({});
                setLat(String(current.coords.latitude.toFixed(6)));
                setLng(String(current.coords.longitude.toFixed(6)));
              } catch {}
            }}
            style={{
              borderWidth: 1,
              borderColor: '#0d9488',
              borderRadius: 8,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f0fdfa',
            }}
          >
            <Text style={{ color: '#0d9488', fontSize: 12, fontWeight: '500' }}>📍</Text>
          </Pressable>
        </View>
      </View>

      {/* Price Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Price (EUR)</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>How much does it cost? (0 for free)</Text>
        <TextInput
          placeholder="15.00"
          value={price}
          onChangeText={setPrice}
          inputMode="decimal"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
        />
      </View>

      {/* Date & Time Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Date & Time *</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>When does your event start and end?</Text>
        
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 4 }}>Starts at:</Text>
          <TextInput
            placeholder="2025-09-05 18:00"
            value={startsAt}
            onChangeText={setStartsAt}
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
          />
        </View>
        
        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 4 }}>Ends at:</Text>
          <TextInput
            placeholder="2025-09-05 20:00"
            value={endsAt}
            onChangeText={setEndsAt}
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
          />
        </View>
      </View>

      {/* Description Section */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Description</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Tell people what to expect (optional)</Text>
        <TextInput
          placeholder="What should people bring? Any special instructions? Tell them what makes this event special!"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{
            borderWidth: 1,
            borderColor: '#d1d5db',
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            minHeight: 100,
          }}
        />
      </View>

      {/* Submit Button */}
      <Pressable
        onPress={submit}
        disabled={saving}
        style={{
          backgroundColor: saving ? '#9ca3af' : '#0d9488',
          borderRadius: 12,
          padding: 16,
          alignItems: 'center',
          marginBottom: 32,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>
          {saving ? 'Creating Event...' : '🎉 Create Event'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
