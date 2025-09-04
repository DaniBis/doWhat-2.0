import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
// Lazy import expo-maps to avoid crashing if the native module
// is not present (e.g., running in Expo Go or before rebuilding).
type MapsModule = typeof import('expo-maps');
import { router } from 'expo-router';

import { getLastKnownBackgroundLocation } from '../lib/bg-location';
import { supabase } from '../lib/supabase';

import { formatDateRange, formatPrice } from '@dowhat/shared';
import { Link } from 'expo-router';

type Row = {
  session_id: string;
  activity_id: string;
  activity_name: string;
  venue_id: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  distance_km: number;
};

type Marker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  activity_id: string;
};

type Cluster = {
  id: string;
  latitude: number;
  longitude: number;
  venues: Marker[];
};

export default function MapTab() {
  // Custom marker overlay for Figma-style bold, colorful, rounded markers
  function renderMarkerOverlay(marker: Marker) {
    // Use a different color for clusters
    const isCluster = marker.id.startsWith('cluster:');
    const bgColor = isCluster ? '#6366f1' : '#f59e42';
    const borderColor = '#fff';
    const shadowColor = isCluster ? '#6366f1' : '#f59e42';
    return (
      <View style={{ backgroundColor: bgColor, borderRadius: 999, padding: isCluster ? 10 : 12, minWidth: isCluster ? 40 : 44, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor, shadowColor, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: isCluster ? 18 : 22 }}>{isCluster ? marker.title.split(' ')[0] : '📍'}</Text>
      </View>
    );
  }
  const [maps, setMaps] = useState<MapsModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [clusterIndex, setClusterIndex] = useState<Record<string, Marker[]>>({});
  const cameraRef = useRef<any>(null);
  const [km, setKm] = useState<number>(25);
  const [allActivities, setAllActivities] = useState<{ id: string; name: string }[]>([]);
  const [selectedActIds, setSelectedActIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheet, setSheet] = useState<{ venueId: string; title: string; lat: number; lng: number } | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetRows, setSheetRows] = useState<any[] | null>(null);
  const [followMe, setFollowMe] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingAddr, setPendingAddr] = useState<string | null>(null);

  const MapView = Platform.OS === 'ios' ? maps?.AppleMaps.View : maps?.GoogleMaps.View;

  async function locate() {
    try {
      setErr(null);
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') fg = await Location.requestForegroundPermissionsAsync();
      let pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (pos?.coords) {
        const la = Number(pos.coords.latitude.toFixed(6));
        const ln = Number(pos.coords.longitude.toFixed(6));
        setLat(la); setLng(ln);
        (cameraRef.current as any)?.setCameraPosition?.({ coordinates: { latitude: la, longitude: ln }, zoom: 12, ...(Platform.OS === 'android' ? { duration: 600 } : {}) });
      }
    } catch (e: any) { setErr(e?.message ?? 'Failed to get location'); }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // pick best coordinates available
      let la: number | null = null; let ln: number | null = null;
      try {
        const cached = await getLastKnownBackgroundLocation();
        if (cached) { la = cached.lat; ln = cached.lng; }
      } catch {}
      if (la == null || ln == null) {
        try {
          const p = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
          if (p?.coords) { la = Number(p.coords.latitude.toFixed(6)); ln = Number(p.coords.longitude.toFixed(6)); }
        } catch {}
      }
      setLat(la); setLng(ln);

      const { data, error } = await supabase.rpc('sessions_nearby', {
        lat: la ?? null,
        lng: ln ?? null,
        p_km: km,
        activities: selectedActIds.length ? selectedActIds : null,
        day: null,
      });
      if (error) throw error;
      const arr = (data ?? []) as Row[];
      const map: Record<string, Marker> = {};
      for (const r of arr) {
        if (r.venue_lat == null || r.venue_lng == null) continue;
        if (!map[r.venue_id]) {
          map[r.venue_id] = {
            id: r.venue_id,
            title: r.venue_name,
            latitude: r.venue_lat,
            longitude: r.venue_lng,
            activity_id: r.activity_id,
          };
        }
      }
      const base = Object.values(map);
      // Simple grid-based clustering (~300m cells)
      const cell = 0.003; // degrees
      const buckets: Record<string, Marker[]> = {};
      for (const m of base) {
        const key = `${Math.round(m.latitude / cell)}:${Math.round(m.longitude / cell)}`;
        (buckets[key] ||= []).push(m);
      }
      const render: Marker[] = [];
      const clusterIdx: Record<string, Marker[]> = {};
      for (const [key, list] of Object.entries(buckets)) {
        if (list.length <= 2) {
          render.push(...list);
        } else {
          const latAvg = list.reduce((s, v) => s + v.latitude, 0) / list.length;
          const lngAvg = list.reduce((s, v) => s + v.longitude, 0) / list.length;
          const id = `cluster:${key}`;
          clusterIdx[id] = list;
          render.push({ id, title: `${list.length} places`, latitude: latAvg, longitude: lngAvg, activity_id: list[0].activity_id });
        }
      }
      setClusterIndex(clusterIdx);
      setMarkers(render);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load native maps module dynamically; avoid importing if native lib is absent
    (async () => {
      try {
        const NativeModulesProxy = (require('expo-modules-core') as any)?.NativeModulesProxy;
        const hasNative = Boolean(NativeModulesProxy?.ExpoMaps);
        if (!hasNative) {
          setErr('Map module not available. Rebuild the app (npx expo run:ios / run:android) to use maps.');
          return;
        }
        const m = await import('expo-maps');
        setMaps(m);
      } catch (e: any) {
        setErr('Map module not available. Rebuild the app (npx expo run:ios / run:android) to use maps.');
      }
    })();
    load();
    // fetch activities for filters
    (async () => {
      const { data } = await supabase.from('activities').select('id,name').order('name');
      setAllActivities((data ?? []) as any);
    })();
  }, []);

  const cameraPosition = useMemo(() => ({
    coordinates: lat != null && lng != null ? { latitude: lat, longitude: lng } : { latitude: 51.5074, longitude: -0.1278 },
    zoom: 11,
  }), [lat, lng]);

  // Keep a live foreground position to update the blue dot while the map is open
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
          (pos) => {
            const la = Number(pos.coords.latitude.toFixed(6));
            const ln = Number(pos.coords.longitude.toFixed(6));
            setLat(la); setLng(ln);
            if (followMe) {
              (cameraRef.current as any)?.setCameraPosition?.({
                coordinates: { latitude: la, longitude: ln },
                zoom: 13,
                ...(Platform.OS === 'android' ? { duration: 500 } : {}),
              });
            }
          }
        );
      } catch {}
    })();
    return () => { sub?.remove(); };
  }, [followMe]);

  // Circle to represent "My location" (cross‑platform)
  const myCircles = useMemo(() => (
    [
      ...(lat != null && lng != null
        ? [{ id: 'me', center: { latitude: lat, longitude: lng }, radius: 12, color: 'rgba(37,99,235,0.25)', lineColor: '#2563eb', lineWidth: 2 }]
        : []),
      ...(pendingAdd ? [{ id: 'add', center: { latitude: pendingAdd.lat, longitude: pendingAdd.lng }, radius: 10, color: 'rgba(245, 158, 11, 0.20)', lineColor: '#f59e0b', lineWidth: 2 }] : []),
    ]
  ), [lat, lng]);

  if (!MapView) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: '#2C3E50' }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Map</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Map unavailable</Text>
          <Text style={{ color: '#4b5563' }}>
            Please rebuild the native app to enable maps. In the project root: cd apps/doWhat-mobile && npx expo run:ios (or run:android). Then restart the app.
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12, borderWidth: 1, borderRadius: 8, padding: 10 }}>
            <Text>Retry</Text>
          </Pressable>
          {err && <Text style={{ marginTop: 8, color: '#b91c1c' }}>{err}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: '#2C3E50', zIndex: 10 }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
        </Pressable>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Map</Text>
        <View style={{ width: 32 }} />
      </View>
      <MapView
        ref={cameraRef as any}
        style={{ flex: 1 }}
        cameraPosition={cameraPosition}
        markers={markers.map((m) => ({
          id: m.id,
          title: m.title,
          coordinates: { latitude: m.latitude, longitude: m.longitude },
          overlay: () => renderMarkerOverlay(m),
        })) as any}
        circles={myCircles as any}
        properties={{ isMyLocationEnabled: true }}
        uiSettings={{ myLocationButtonEnabled: false }}
        onMapClick={(ev: any) => {
          if (Platform.OS === 'ios' && ev?.coordinates) {
            const { latitude, longitude } = ev.coordinates;
            setPendingAdd({ lat: latitude, lng: longitude });
            (async () => {
              try {
                const arr = await Location.reverseGeocodeAsync({ latitude, longitude });
                const best = arr?.[0];
                const parts = [best?.name, best?.street, best?.city].filter(Boolean) as string[];
                setPendingAddr(parts.join(', '));
              } catch { setPendingAddr(null); }
            })();
          }
        }}
        onMapLongClick={(ev: any) => {
          if (Platform.OS === 'android' && ev?.coordinates) {
            const { latitude, longitude } = ev.coordinates;
            setPendingAdd({ lat: latitude, lng: longitude });
            (async () => {
              try {
                const arr = await Location.reverseGeocodeAsync({ latitude, longitude });
                const best = arr?.[0];
                const parts = [best?.name, best?.street, best?.city].filter(Boolean) as string[];
                setPendingAddr(parts.join(', '));
              } catch { setPendingAddr(null); }
            })();
          }
        }}
        onMarkerClick={(ev: any) => {
          const id = ev?.id as string | undefined;
          const match = markers.find((m) => m.id === id);
          if (!match) return;
          if (id?.startsWith('cluster:')) {
            // Open a sheet listing venues in this cluster
            const venues = clusterIndex[id] || [];
            setSheet({ venueId: '', title: `${venues.length} places nearby`, lat: match.latitude, lng: match.longitude });
            setSheetRows(venues.map(v => ({ __venue: v })) as any);
            setSheetLoading(false);
            return;
          }
          // Single venue sheet
          setSheet({ venueId: match.id, title: match.title, lat: match.latitude, lng: match.longitude });
          (async () => {
            setSheetLoading(true); setSheetRows(null);
            const { data, error } = await supabase
              .from('sessions')
              .select('id, starts_at, ends_at, price_cents, activities(name)')
              .eq('venue_id', match.id)
              .order('starts_at', { ascending: true })
              .limit(10);
            if (!error) setSheetRows((data ?? []) as any[]);
            setSheetLoading(false);
          })();
        }}
      />
      {/* Controls */}
      <View style={{ position: 'absolute', top: 12, right: 12, gap: 8 }}>
        <Pressable onPress={locate} style={{ backgroundColor: 'white', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text>Locate me</Text>
        </Pressable>
        <Pressable onPress={() => { if (lat!=null && lng!=null) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`); }} style={{ backgroundColor: 'white', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text>Open in Maps</Text>
        </Pressable>
        <Pressable onPress={() => { setFollowMe((v) => !v); if (!followMe) locate(); }} style={{ backgroundColor: 'white', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text>{followMe ? 'Following you' : 'Follow me'}</Text>
        </Pressable>
        <View style={{ backgroundColor: 'white', borderWidth: 1, borderRadius: 8, padding: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#4b5563' }}>Radius (km)</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {[5,10,25,50].map((n) => (
              <Pressable key={n} onPress={() => { setKm(n); load(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, borderWidth: 1, borderColor: n===km ? '#0d9488' : '#d1d5db', backgroundColor: n===km ? 'rgba(13,148,136,0.08)' : 'white' }}>
                <Text style={{ color: n===km ? '#0d9488' : '#374151' }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setFiltersOpen(true)} style={{ marginTop: 6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text>Filters</Text>
          </Pressable>
        </View>
      </View>
      {loading && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8, alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      )}
      {err && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: 'rgba(185,28,28,0.1)' }}>
          <Text style={{ color: '#991b1b', textAlign: 'center' }}>{err}</Text>
        </View>
      )}

      {/* Bottom sheet with venue details (rounded, colorful accent) */}
      {sheet && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 2, borderColor: '#f59e42', shadowColor: '#f59e42', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 4, color: '#2C3E50' }}>{sheet.title}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${sheet.lat},${sheet.lng}`)} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#6366f1' }}>
                <Text style={{ color: '#6366f1' }}>Open in Maps</Text>
              </Pressable>
              <Pressable onPress={() => setSheet(null)} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#f59e42' }}>
                <Text style={{ color: '#f59e42' }}>Close</Text>
              </Pressable>
            </View>
            {sheetLoading && <ActivityIndicator style={{ marginTop: 8 }} />}
            {!sheetLoading && (
              <ScrollView style={{ maxHeight: 260, marginTop: 8 }}>
                {(!sheetRows || !sheetRows.length) && (
                  <Text style={{ color: '#6b7280' }}>No upcoming sessions.</Text>
                )}
                {sheetRows?.map((s: any) => (
                  s.__venue ? (
                    <View key={s.__venue.id} style={{ borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.04)' }}>
                      <Text style={{ fontWeight: '600', color: '#2C3E50' }}>{s.__venue.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <Pressable onPress={() => {
                          setSheet({ venueId: s.__venue.id, title: s.__venue.title, lat: s.__venue.latitude, lng: s.__venue.longitude });
                          (async () => {
                            setSheetLoading(true); setSheetRows(null);
                            const { data, error } = await supabase
                              .from('sessions')
                              .select('id, starts_at, ends_at, price_cents, activities(name)')
                              .eq('venue_id', s.__venue.id)
                              .order('starts_at', { ascending: true })
                              .limit(10);
                            if (!error) setSheetRows((data ?? []) as any[]);
                            setSheetLoading(false);
                          })();
                        }} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#6366f1' }}>
                          <Text style={{ color: '#6366f1' }}>View sessions</Text>
                        </Pressable>
                        <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${s.__venue.latitude},${s.__venue.longitude}`)} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#6366f1' }}>
                          <Text style={{ color: '#6366f1' }}>Open in Maps</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View key={s.id} style={{ borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, borderColor: '#f59e42', backgroundColor: 'rgba(245,158,66,0.04)' }}>
                      <Text style={{ fontWeight: '600', color: '#2C3E50' }}>{s.activities?.name ?? 'Activity'}</Text>
                      <Text style={{ marginTop: 2 }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
                      {!!s.price_cents && <Text style={{ marginTop: 2 }}>{formatPrice(s.price_cents)}</Text>}
                      <Link href={`/sessions/${s.id}`} asChild>
                        <Pressable style={{ marginTop: 6, backgroundColor: '#0d9488', paddingVertical: 8, borderRadius: 8 }}>
                          <Text style={{ color: 'white', textAlign: 'center' }}>View details</Text>
                        </Pressable>
                      </Link>
                    </View>
                  )
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}

      {/* Filter overlay (rounded, colorful accent) */}
      {filtersOpen && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setFiltersOpen(false)} />
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 2, borderColor: '#6366f1', shadowColor: '#6366f1', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#2C3E50' }}>Filter activities</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {allActivities.map((a) => {
                const sel = selectedActIds.includes(a.id);
                return (
                  <Pressable key={a.id} onPress={() => setSelectedActIds((prev) => prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id])} style={{ marginRight: 8, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999, borderWidth: 2, borderColor: sel ? '#6366f1' : '#d1d5db', backgroundColor: sel ? 'rgba(99,102,241,0.08)' : 'white' }}>
                    <Text style={{ color: sel ? '#6366f1' : '#374151', fontWeight: sel ? '700' : '400' }}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => { setFiltersOpen(false); load(); }} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#6366f1' }}>
                <Text style={{ color: '#6366f1' }}>Apply</Text>
              </Pressable>
              <Pressable onPress={() => { setSelectedActIds([]); setFiltersOpen(false); load(); }} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#f59e42' }}>
                <Text style={{ color: '#f59e42' }}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {/* Add event helper when a point is selected */}
      {pendingAdd && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, padding: 10 }}>
          <Text style={{ fontWeight: '600' }}>Create event here?</Text>
          <Text style={{ color: '#6b7280', marginTop: 2 }}>{pendingAdd.lat.toFixed(5)}, {pendingAdd.lng.toFixed(5)}</Text>
          {pendingAddr && <Text style={{ color: '#374151', marginTop: 2 }}>{pendingAddr}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => { setPendingAdd(null); setPendingAddr(null); }} style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { router.push(`/add-event?lat=${pendingAdd.lat}&lng=${pendingAdd.lng}`); setPendingAdd(null); setPendingAddr(null); }} style={{ backgroundColor: '#0d9488', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: 'white' }}>Add event</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
