import * as Location from 'expo-location';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';

import { supabase } from '../lib/supabase';

type Option = { id: string; name: string };

type VenueInsert = { name: string; lat?: number; lng?: number };

type SessionInsert = {
  activity_id: string;
  venue_id: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  created_by: string;
  description?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toOption = (value: unknown): Option | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : null;
  if (!id) return null;
  const name = typeof value.name === 'string' && value.name ? value.name : id;
  return { id, name };
};

const extractId = (value: unknown): string => {
  if (isRecord(value) && typeof value.id === 'string' && value.id) {
    return value.id;
  }
  throw new Error('Response missing identifier');
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatTime = (date: Date) => date.toISOString().slice(11, 16);

const sanitizeTimeInput = (value: string) => {
  const numeric = value.replace(/[^0-9:]/g, '').slice(0, 5);
  if (numeric.length === 4 && !numeric.includes(':')) {
    return `${numeric.slice(0, 2)}:${numeric.slice(2)}`;
  }
  return numeric;
};

const parseDateTime = (dateStr: string, timeStr: string) => {
  const date = dateStr.trim();
  const time = timeStr.trim();
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? null : combined;
};

const adjustEndIfNeeded = (sDate: string, sTime: string, eDate: string, eTime: string) => {
  const start = parseDateTime(sDate, sTime);
  const end = parseDateTime(eDate, eTime);
  if (start && end && end <= start) {
    const adjusted = new Date(start.getTime() + 60 * 60 * 1000);
    return { endDate: formatDate(adjusted), endTime: formatTime(adjusted) };
  }
  return { endDate: eDate, endTime: eTime };
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Failed to create event';
  }
};

export default function AddEvent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; activityId?: string; activityName?: string }>();
  const [activities, setActivities] = useState<Option[]>([]);
  const [venues, setVenues] = useState<Option[]>([]);

  const [activityId, setActivityId] = useState(params.activityId ? String(params.activityId) : '');
  const [activityName, setActivityName] = useState(
    params.activityName && typeof params.activityName === 'string' ? params.activityName : ''
  );
  const [selectedActivityLabel, setSelectedActivityLabel] = useState<string | null>(
    params.activityName && typeof params.activityName === 'string' ? params.activityName : null
  );
  const [venueId, setVenueId] = useState('');
  const [venueName, setVenueName] = useState('');
  const [selectedVenueLabel, setSelectedVenueLabel] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [price, setPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePriceChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    if (!cleaned.includes('.')) {
      setPrice(cleaned);
      return;
    }
    const [whole, fractional] = cleaned.split('.');
    const normalizedFractional = (fractional ?? '').replace(/\./g, '').slice(0, 2);
    const normalizedWhole = whole || '0';
    setPrice(normalizedFractional.length ? `${normalizedWhole}.${normalizedFractional}` : normalizedWhole);
  };

  const dateBoxStyle = {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
  } as const;

  const dateLabelStyle = { fontSize: 12, color: '#6b7280', marginBottom: 6 } as const;
  const dateValueStyle = { fontSize: 16, fontWeight: '600' as const, color: '#111827' } as const;

  const activityQuery = activityName.trim().toLowerCase();
  const matchingActivities = useMemo(() => {
    if (!activityQuery) return [] as Option[];
    if (selectedActivityLabel && activityQuery === selectedActivityLabel.trim().toLowerCase()) {
      return [] as Option[];
    }
    return activities
      .filter((activity) => activity.name.toLowerCase().includes(activityQuery))
      .slice(0, 5);
  }, [activities, activityQuery, selectedActivityLabel]);

  useEffect(() => {
    (async () => {
      const activitiesRes = await supabase.from('activities').select('id, name').order('name');
      if (!activitiesRes.error) {
        const options = Array.isArray(activitiesRes.data)
          ? activitiesRes.data.map(toOption).filter((opt): opt is Option => Boolean(opt))
          : [];
        setActivities(options);
      }
      const venuesRes = await supabase.from('venues').select('id, name').order('name');
      if (!venuesRes.error) {
        const options = Array.isArray(venuesRes.data)
          ? venuesRes.data.map(toOption).filter((opt): opt is Option => Boolean(opt))
          : [];
        setVenues(options);
      }

      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') await Location.requestForegroundPermissionsAsync();
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (last) {
          setLat(String(last.coords.latitude.toFixed(6)));
          setLng(String(last.coords.longitude.toFixed(6)));
        }
      } catch {}

      if (params?.lat && params?.lng) {
        setLat(String(params.lat));
        setLng(String(params.lng));
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const defaultEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000);
      setStartDate(formatDate(tomorrow));
      setStartTime(formatTime(tomorrow));
      setEndDate(formatDate(defaultEnd));
      setEndTime(formatTime(defaultEnd));
    })();
  }, [params?.lat, params?.lng]);

  useEffect(() => {
    (async () => {
      if (!lat || !lng || venueName.trim()) {
        setSuggestedName(null);
        return;
      }
      try {
        const arr = await Location.reverseGeocodeAsync({ latitude: parseFloat(lat), longitude: parseFloat(lng) });
        const best = arr?.[0];
        if (best) {
          const parts = [best.name, best.street, best.city].filter(Boolean) as string[];
          setSuggestedName(parts.join(', ').trim() || null);
        } else {
          setSuggestedName(null);
        }
      } catch {
        setSuggestedName(null);
      }
    })();
  }, [lat, lng, venueName]);

  const ensureActivity = async (): Promise<string> => {
    if (activityId) return activityId;
    const name = activityName.trim();
    if (!name) throw new Error('Enter an activity name or choose one.');

    const { data: existing, error: existingError } = await supabase
      .from('activities')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return existing.id;

    const { data: ilikeExisting, error: ilikeError } = await supabase
      .from('activities')
      .select('id')
      .limit(1)
      .ilike('name', name)
      .maybeSingle();
    if (ilikeError) throw ilikeError;
    if (ilikeExisting?.id) return ilikeExisting.id;

    const { data, error } = await supabase
      .from('activities')
      .insert({ name })
      .select('id')
      .single();
    if (error) throw error;
    return extractId(data);
  };

  const ensureVenue = async (): Promise<string> => {
    if (venueId) return venueId;
    const name = venueName.trim();
    if (!name) throw new Error('Enter a venue name or choose one.');

    const { data: existing, error: existingError } = await supabase
      .from('venues')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return existing.id;

    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    const payload: VenueInsert = { name };
    if (!Number.isNaN(la)) payload.lat = la;
    if (!Number.isNaN(ln)) payload.lng = ln;
    const { data, error } = await supabase
      .from('venues')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return extractId(data);
  };

  async function submit() {
    try {
      setErr(null);
      setMsg(null);
      setSaving(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Please sign in.');
      const act = await ensureActivity();
      const ven = await ensureVenue();

      const start = parseDateTime(startDate, startTime);
      const end = parseDateTime(endDate, endTime);
      if (!start || !end) throw new Error('Enter valid start/end date and time (YYYY-MM-DD and HH:MM).');
      if (end <= start) throw new Error('End time must be after the start time.');

      const cents = Math.round((Number(price) || 0) * 100);
      const payload: SessionInsert = {
        activity_id: act,
        venue_id: ven,
        price_cents: cents,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        created_by: uid,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      const { data, error } = await supabase
        .from('sessions')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      const sessionId = extractId(data);

      setMsg('Event created successfully!');
      Alert.alert('Success', 'Event created successfully!', [
        { text: 'OK', onPress: () => router.replace(`/sessions/${sessionId}`) },
      ]);
    } catch (error) {
      console.error('Event creation failed', error);
      setErr(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
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
                    setActivityName(activity.name);
                    setSelectedActivityLabel(activity.name);
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
            if (text !== selectedActivityLabel) setActivityId('');
            setSelectedActivityLabel(null);
          }}
          style={{
            borderWidth: 1,
            borderColor: activityId ? '#0d9488' : '#0d9488',
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            backgroundColor: 'white',
          }}
        />
        {selectedActivityLabel && activityId && (
          <Text style={{ marginTop: 4, fontSize: 12, color: '#0d9488' }}>
            Using existing activity: {selectedActivityLabel}
          </Text>
        )}

        {activityName.trim().length > 0 && matchingActivities.length > 0 && (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>Suggested existing activities</Text>
            {matchingActivities.map((activity) => (
              <Pressable
                key={activity.id}
                onPress={() => {
                  setActivityId(activity.id);
                  setActivityName(activity.name);
                  setSelectedActivityLabel(activity.name);
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  backgroundColor: '#f9fafb',
                }}
              >
                <Text style={{ fontSize: 14, color: '#111827' }}>Use existing “{activity.name}”</Text>
              </Pressable>
            ))}
          </View>
        )}
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
                  setVenueName(venue.name);
                  setSelectedVenueLabel(venue.name);
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
            if (text !== selectedVenueLabel) setVenueId('');
            setSelectedVenueLabel(null);
          }}
          style={{
            borderWidth: 1,
            borderColor: '#0d9488',
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            backgroundColor: 'white',
            marginBottom: 8,
          }}
        />
        {selectedVenueLabel && venueId && (
          <Text style={{ marginTop: -4, marginBottom: 8, fontSize: 12, color: '#0d9488' }}>
            Using existing venue: {selectedVenueLabel}
          </Text>
        )}

        {suggestedName && !venueId && (
          <Pressable onPress={() => setVenueName(suggestedName)} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
            <Text style={{ color: '#0d9488', fontSize: 14 }}>💡 Use suggested: {suggestedName}</Text>
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
          onChangeText={handlePriceChange}
          keyboardType="decimal-pad"
          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
        />
      </View>

      {/* Date & Time Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Date & Time *</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>When does your event start and end?</Text>
        <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
          Tap the fields below to edit. Use the format YYYY-MM-DD and 24h time (HH:MM).
        </Text>

        <View style={{ gap: 16 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 6 }}>Starts</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={dateBoxStyle}>
                <Text style={dateLabelStyle}>Date</Text>
                <TextInput
                  value={startDate}
                  onChangeText={(value) => {
                    setStartDate(value);
                    const adjusted = adjustEndIfNeeded(value, startTime, endDate, endTime);
                    setEndDate(adjusted.endDate);
                    setEndTime(adjusted.endTime);
                  }}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={{ ...dateValueStyle, padding: 0 }}
                />
              </View>
              <View style={dateBoxStyle}>
                <Text style={dateLabelStyle}>Time</Text>
                <TextInput
                  value={startTime}
                  onChangeText={(value) => {
                    const formatted = sanitizeTimeInput(value);
                    setStartTime(formatted);
                    const adjusted = adjustEndIfNeeded(startDate, formatted, endDate, endTime);
                    setEndDate(adjusted.endDate);
                    setEndTime(adjusted.endTime);
                  }}
                  placeholder="HH:MM"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={{ ...dateValueStyle, padding: 0 }}
                />
              </View>
            </View>
          </View>

          <View>
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 6 }}>Ends</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={dateBoxStyle}>
                <Text style={dateLabelStyle}>Date</Text>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={{ ...dateValueStyle, padding: 0 }}
                />
              </View>
              <View style={dateBoxStyle}>
                <Text style={dateLabelStyle}>Time</Text>
                <TextInput
                  value={endTime}
                  onChangeText={(value) => setEndTime(sanitizeTimeInput(value))}
                  placeholder="HH:MM"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={{ ...dateValueStyle, padding: 0 }}
                />
              </View>
            </View>
          </View>
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
