import { formatDateRange, formatPrice } from '@dowhat/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Platform } from 'react-native';

import RsvpBadges from '../components/RsvpBadges';
import { supabase } from '../lib/supabase';

type SessionRow = {
  session_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activity_id: string;
  activity_name: string;
  venue_id: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  distance_km: number;
};

type Activity = { id: string; name: string };

function Chip({ selected, label, onPress }: { selected?: boolean; label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: selected ? '#0d9488' : '#d1d5db',
        backgroundColor: selected ? 'rgba(13,148,136,0.08)' : 'white',
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: selected ? '#0d9488' : '#374151' }}>{label}</Text>
    </Pressable>
  );
}

export default function Nearby() {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [km, setKm] = useState('25');
  const [day, setDay] = useState(''); // yyyy-MM-dd

  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      // restore last search
      try {
        const raw = await AsyncStorage.getItem('nearby:last');
        if (raw) {
          const cache = JSON.parse(raw) as Partial<{
            lat: string; lng: string; km: string; day: string; act: string[];
          }>;
          if (cache.lat) setLat(cache.lat);
          if (cache.lng) setLng(cache.lng);
          if (cache.km) setKm(cache.km);
          if (cache.day) setDay(cache.day);
          if (cache.act) setSelectedIds(cache.act);
        }
      } catch {}

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLat(String(loc.coords.latitude.toFixed(6)));
          setLng(String(loc.coords.longitude.toFixed(6)));
        }
        if (!lat || !lng) {
          // Fall back to profile's last known background location
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id ?? null;
          if (uid) {
            const { data } = await supabase.from('profiles').select('last_lat,last_lng').eq('id', uid).maybeSingle();
            const la = (data as any)?.last_lat; const ln = (data as any)?.last_lng;
            if (la != null && ln != null) { setLat(String(la)); setLng(String(ln)); }
          }
        }
      } catch {}
    })();

    (async () => {
      const { data } = await supabase.from('activities').select('id,name').order('name');
      setAllActivities((data ?? []) as Activity[]);
    })();
  }, []);

  const chosenActivities = useMemo(
    () => (selectedIds.length ? selectedIds : null),
    [selectedIds]
  );

  async function search() {
    setErr(null);
    setRows(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const kmNum = parseFloat(km);
    if ([latNum, lngNum, kmNum].some((n) => Number.isNaN(n))) {
      setErr('Please enter valid numbers for lat, lng and km.');
      return;
    }

    const dayStr = day ? new Date(day).toISOString().slice(0, 10) : null;

    setLoading(true);
    const { data, error } = await supabase
      .rpc('sessions_nearby', {
        lat: latNum,
        lng: lngNum,
        p_km: kmNum,
        activities: chosenActivities,
        day: dayStr,
      });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SessionRow[];
    const sorted = rows.sort(
      (a: SessionRow, b: SessionRow) =>
        a.distance_km - b.distance_km || +new Date(a.starts_at) - +new Date(b.starts_at)
    );
    setRows(sorted);
    setLoading(false);

    // cache for convenience
    try {
      await AsyncStorage.setItem('nearby:last', JSON.stringify({ lat, lng, km, day, act: selectedIds }));
    } catch {}
  }

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Link href="/" asChild>
        <Pressable style={{ marginBottom: 8 }}>
          <Text style={{ color: '#0d9488' }}>&larr; Back</Text>
        </Pressable>
      </Link>

      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Activities near you</Text>

      <Text style={{ marginBottom: 4 }}>Latitude</Text>
      <TextInput
        value={lat}
        onChangeText={setLat}
        placeholder="51.5074"
        inputMode="decimal"
        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
      />
      <Text style={{ marginBottom: 4 }}>Longitude</Text>
      <TextInput
        value={lng}
        onChangeText={setLng}
        placeholder="-0.1278"
        inputMode="decimal"
        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
      />
      <Text style={{ marginBottom: 4 }}>Radius (km)</Text>
      <TextInput
        value={km}
        onChangeText={setKm}
        placeholder="25"
        inputMode="numeric"
        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
      />
      <Pressable
        onPress={async () => {
          setErr(null);
          setLocating(true);
          try {
            // Check and request permission
            let perm = await Location.getForegroundPermissionsAsync();
            if (perm.status !== 'granted') {
              perm = await Location.requestForegroundPermissionsAsync();
            }
            if (perm.status !== 'granted') {
              setErr('Location permission denied. Enter coordinates or allow permission in settings.');
              return;
            }
            // Try last known position first (faster/more reliable in simulators)
            let pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
            if (!pos) {
              pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
            }
            if (!pos) {
              if (Platform.OS === 'ios') {
                setErr('No location available. In the iOS Simulator, set Features → Location to a custom value.');
              } else {
                setErr('No location available. Try again outdoors or enter coordinates manually.');
              }
              return;
            }
            setLat(String(pos.coords.latitude.toFixed(6)));
            setLng(String(pos.coords.longitude.toFixed(6)));
          } catch (e: any) {
            const msg = e?.message || 'Failed to get current location.';
            setErr(Platform.OS === 'ios' && msg.includes('The operation couldn’t be completed')
              ? 'Simulator has no GPS point. Set Features → Location to a custom location.'
              : msg);
          } finally {
            setLocating(false);
          }
        }}
        style={{ alignSelf: 'flex-start', marginBottom: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, opacity: locating ? 0.6 : 1 }}
        disabled={locating}
      >
        <Text>{locating ? 'Locating…' : 'Use my location'}</Text>
      </Pressable>
      <Text style={{ marginBottom: 4 }}>Date</Text>
      <TextInput
        value={day}
        onChangeText={setDay}
        placeholder="YYYY-MM-DD"
        style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {allActivities.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={selectedIds.includes(a.id)}
            onPress={() =>
              setSelectedIds((prev) =>
                prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]
              )
            }
          />
        ))}
      </View>

      <Pressable
        onPress={search}
        disabled={loading}
        style={{ backgroundColor: '#0d9488', padding: 12, borderRadius: 8, opacity: loading ? 0.6 : 1 }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>{loading ? 'Searching…' : 'Search'}</Text>
      </Pressable>

      {err ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: '#b91c1c' }}>{err}</Text>
          {/permission/i.test(err) && (
            <Pressable style={{ marginTop: 6 }} onPress={() => Linking.openSettings?.()}>
              <Text style={{ color: '#0d9488' }}>Open Settings</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <FlatList
        style={{ marginTop: 12 }}
        data={rows ?? []}
        keyExtractor={(r) => r.session_id}
        renderItem={({ item: r }) => (
          <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <Text style={{ fontWeight: '600' }}>{r.activity_name}</Text>
            <Text>{r.venue_name}</Text>
            <Text>{formatDateRange(r.starts_at, r.ends_at)}</Text>
            <Text>{r.distance_km.toFixed(1)} km away</Text>
            {!!r.price_cents && <Text>{formatPrice(r.price_cents)}</Text>}
            <RsvpBadges activityId={r.activity_id} />
            {r.venue_lat != null && r.venue_lng != null && (
              <Pressable
                style={{ marginTop: 6 }}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.venue_lat},${r.venue_lng}`)}
              >
                <Text style={{ color: '#0d9488' }}>
                  Open in Maps: {r.venue_lat}, {r.venue_lng}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={{ textAlign: 'center', marginTop: 12 }}>No results yet.</Text>
          ) : null
        }
      />
    </View>
  );
}
