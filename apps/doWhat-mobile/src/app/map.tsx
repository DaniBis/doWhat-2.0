import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import type { ReactNode, Ref } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { theme } from '@dowhat/shared';
// Lazy import expo-maps to avoid crashing if the native module
// is not present (e.g., running in Expo Go or before rebuilding).
type MapsModule = typeof import('expo-maps');
import { router, Link } from 'expo-router';

import { getLastKnownBackgroundLocation } from '../lib/bg-location';
import { supabase } from '../lib/supabase';
import { createWebUrl } from '../lib/web';

import { formatDateRange, formatPrice } from '@dowhat/shared';

type Marker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  activity_id: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type MapInteractionEvent = {
  coordinates?: Coordinates;
  id?: string;
  nativeEvent?: {
    coordinate?: Coordinates;
    position?: Coordinates;
    id?: string;
  };
};

type MarkerClickEvent = MapInteractionEvent & { id?: string };

type MapCameraHandle = {
  setCameraPosition?: (options: { coordinates: Coordinates; zoom?: number; duration?: number }) => void;
};

type MapCircle = {
  id: string;
  center: Coordinates;
  radius: number;
  color?: string;
  lineColor?: string;
  lineWidth?: number;
};

type MapMarker = {
  id: string;
  title: string;
  coordinates: Coordinates;
  overlay?: () => ReactNode;
};

type MapComponentProps = {
  style?: object;
  cameraPosition?: {
    coordinates: Coordinates;
    zoom?: number;
  };
  markers?: MapMarker[];
  circles?: MapCircle[];
  properties?: { isMyLocationEnabled?: boolean };
  uiSettings?: { myLocationButtonEnabled?: boolean };
  onMapClick?: (event: MapInteractionEvent) => void;
  onMapLongClick?: (event: MapInteractionEvent) => void;
  onMarkerClick?: (event: MarkerClickEvent) => void;
};

type MapComponent = (props: MapComponentProps & { ref?: Ref<MapCameraHandle> }) => JSX.Element;

type MapsModuleLike = {
  MapView?: MapComponent;
  AppleMaps?: { View: MapComponent };
  GoogleMaps?: { View: MapComponent };
};

type ActivityOption = { id: string; name: string | null };

type SessionRow = {
  id: string | number;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities: { name?: string | null } | null;
};

type SheetVenueRow = {
  __venue: {
    id: string;
    title: string;
    latitude: number;
    longitude: number;
  };
};

type SheetRow = SessionRow | SheetVenueRow;

const isVenueRow = (row: SheetRow): row is SheetVenueRow => '__venue' in row;

const extractCoordinates = (event: MapInteractionEvent): Coordinates | null => {
  const direct = event.coordinates;
  if (direct && Number.isFinite(direct.latitude) && Number.isFinite(direct.longitude)) {
    return direct;
  }
  const fallback = event.nativeEvent?.coordinate ?? event.nativeEvent?.position;
  if (fallback && Number.isFinite(fallback.latitude) && Number.isFinite(fallback.longitude)) {
    return fallback;
  }
  return null;
};

const getMarkerId = (event: MarkerClickEvent): string | null => {
  return event.id ?? event.nativeEvent?.id ?? null;
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
  const cameraRef = useRef<MapCameraHandle | null>(null);
  const coordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const lastFetchRef = useRef<string | null>(null);
  const [km, setKm] = useState<number>(25);
  const [allActivities, setAllActivities] = useState<ActivityOption[]>([]);
  const [selectedActIds, setSelectedActIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheet, setSheet] = useState<{ venueId: string; title: string; lat: number; lng: number } | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetRows, setSheetRows] = useState<SheetRow[] | null>(null);
  const [followMe, setFollowMe] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingAddr, setPendingAddr] = useState<string | null>(null);

  // Prefer platform-specific views if available, otherwise fall back to the default MapView export
  const mapModule = maps as MapsModuleLike | null;
  const MapView = mapModule?.MapView ?? (Platform.OS === 'ios' ? mapModule?.AppleMaps?.View : mapModule?.GoogleMaps?.View);

  const updateCoords = useCallback((la: number, ln: number) => {
    coordsRef.current = { lat: la, lng: ln };
    setLat((prev) => (prev === la ? prev : la));
    setLng((prev) => (prev === ln ? prev : ln));
  }, []);

  const load = useCallback(async (options?: { coordinates?: Coordinates; force?: boolean }) => {
    setErr(null);
    let requestUrl: string | null = null;
    try {
      const normalize = (value: number) => Number(value.toFixed(6));

      let la: number | null = options?.coordinates?.latitude ?? (coordsRef.current.lat ?? null);
      let ln: number | null = options?.coordinates?.longitude ?? (coordsRef.current.lng ?? null);

      if (la == null || ln == null) {
        try {
          const cached = await getLastKnownBackgroundLocation();
          if (cached) {
            la = normalize(cached.lat);
            ln = normalize(cached.lng);
          }
        } catch {}
      }

      if (la == null || ln == null) {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          perm = await Location.requestForegroundPermissionsAsync();
        }
        if (perm.status !== 'granted') {
          setMarkers([]);
          setClusterIndex({});
          setErr('Location permission is required to show nearby activities.');
          return;
        }

        let pos: Location.LocationObject | null = null;
        try {
          pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        } catch {}
        if (!pos) {
          try {
            pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          } catch {}
        }
        if (pos?.coords) {
          la = normalize(pos.coords.latitude);
          ln = normalize(pos.coords.longitude);
        }
      }

      if (la == null || ln == null) {
        setMarkers([]);
        setClusterIndex({});
        setErr('Unable to determine your location right now.');
        return;
      }

      updateCoords(la, ln);

      const typesKey = selectedActIds.join('|');
      const fetchKey = `${la.toFixed(6)}:${ln.toFixed(6)}:${km}:${typesKey}`;
      if (!options?.force && lastFetchRef.current === fetchKey) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const map: Record<string, Marker> = {};

      const url = createWebUrl('/api/nearby');
      url.searchParams.set('lat', String(la));
      url.searchParams.set('lng', String(ln));
      url.searchParams.set('radius', String(Math.round(km * 1000)));
      if (selectedActIds.length) url.searchParams.set('types', selectedActIds.join(','));

      requestUrl = url.toString();
      const res = await fetch(requestUrl, { credentials: 'include' });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {}
      if (!res.ok) {
        const message = (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string')
          ? payload.error
          : `Failed to load nearby activities (${res.status})`;
        throw new Error(message);
      }

      const acts = Array.isArray(payload?.activities) ? payload.activities : [];
      for (const a of acts) {
        const latA = Number(a.lat);
        const lngA = Number(a.lng);
        if (!Number.isFinite(latA) || !Number.isFinite(lngA)) continue;
        const id = String(a.id);
        if (!map[id]) {
          map[id] = {
            id,
            title: a.name ?? 'Activity',
            latitude: latA,
            longitude: lngA,
            activity_id: id,
          };
        }
      }

      const base = Object.values(map);

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
      lastFetchRef.current = fetchKey;
    } catch (e) {
      if (__DEV__) console.warn('[MapTab] load failed', e);
      if (e instanceof Error) {
        const message = e.message || 'Failed to load map';
        const isNetworkFailure = message.includes('Network request failed');
        const suffix = requestUrl ? ` (${requestUrl})` : '';
        const hint = isNetworkFailure
          ? ' – check that the web server is running and reachable from your device'
          : '';
        setErr(`${message}${hint}${suffix}`);
      } else {
        setErr('Failed to load map');
      }
      setMarkers([]);
      setClusterIndex({});
    } finally {
      setLoading(false);
    }
  }, [km, selectedActIds, updateCoords]);

  const locate = useCallback(async () => {
    try {
      setErr(null);
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        setErr('Location permission is required to locate you.');
        return;
      }

      let pos: Location.LocationObject | null = null;
      try {
        pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      } catch {}
      if (!pos) {
        pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      if (!pos?.coords) {
        throw new Error('Unable to determine your position right now.');
      }

      const la = Number(pos.coords.latitude.toFixed(6));
      const ln = Number(pos.coords.longitude.toFixed(6));
      updateCoords(la, ln);
      cameraRef.current?.setCameraPosition?.({
        coordinates: { latitude: la, longitude: ln },
        zoom: 12,
        ...(Platform.OS === 'android' ? { duration: 600 } : {}),
      });
      await load({ coordinates: { latitude: la, longitude: ln }, force: true });
    } catch (e) {
      if (e instanceof Error) {
        setErr(e.message);
      } else {
        setErr('Failed to get location');
      }
    }
  }, [load, updateCoords]);

  useEffect(() => {
    // Load native maps module dynamically; avoid importing if native lib is absent
    (async () => {
      try {
        try {
          const { NativeModulesProxy } = await import('expo-modules-core');
          const modules = NativeModulesProxy as Record<string, unknown>;
          const hasNative = Boolean(modules?.ExpoMaps || modules?.ExpoMapsModule || modules?.ExpoMapView);
          if (!hasNative) {
            // Fall through to dynamic import attempt which will likely fail but gives a clearer error
            console.warn('[MapTab] Expo Maps native module not detected, attempting dynamic import anyway');
          }
        } catch (nativeErr) {
          console.warn('[MapTab] Failed to inspect native modules for expo-maps', nativeErr);
        }
        const m = await import('expo-maps');
        setMaps(m);
      } catch (importErr) {
        console.warn('[MapTab] expo-maps import failed', importErr);
        setErr('Map module not available. Rebuild the app (npx expo run:ios / run:android) to use maps.');
      }
    })();
    // fetch activities for filters
    (async () => {
      const { data } = await supabase
        .from('activities')
        .select('id,name')
        .order('name');
      setAllActivities((data ?? []) as ActivityOption[]);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
          (pos: Location.LocationObject) => {
            const la = Number(pos.coords.latitude.toFixed(6));
            const ln = Number(pos.coords.longitude.toFixed(6));
            updateCoords(la, ln);
            if (followMe) {
              cameraRef.current?.setCameraPosition?.({
                coordinates: { latitude: la, longitude: ln },
                zoom: 13,
                ...(Platform.OS === 'android' ? { duration: 500 } : {}),
              });
              if (coordsRef.current.lat !== null && coordsRef.current.lng !== null) {
                load({ coordinates: { latitude: la, longitude: ln } });
              }
            }
          }
        );
      } catch {}
    })();
    return () => { sub?.remove(); };
  }, [followMe, load, updateCoords]);

  // Circle to represent "My location" (cross‑platform)
  const myCircles = useMemo(() => (
    [
      ...(lat != null && lng != null
        ? [{ id: 'me', center: { latitude: lat, longitude: lng }, radius: 12, color: 'rgba(37,99,235,0.25)', lineColor: '#2563eb', lineWidth: 2 }]
        : []),
      ...(pendingAdd ? [{ id: 'add', center: { latitude: pendingAdd.lat, longitude: pendingAdd.lng }, radius: 10, color: 'rgba(245, 158, 11, 0.20)', lineColor: '#f59e0b', lineWidth: 2 }] : []),
    ]
  ), [lat, lng, pendingAdd]);

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
          <Pressable onPress={() => load({ force: true })} style={{ marginTop: 12, borderWidth: 1, borderRadius: 8, padding: 10 }}>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: theme.colors.brandTeal, zIndex: 10 }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
        </Pressable>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Map</Text>
        <View style={{ width: 32 }} />
      </View>
      {/* Chip filter row */}
      <View style={{ position: 'absolute', top: 52, left: 8, right: 8, zIndex: 20 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
          {[5, 10, 25].map((n) => (
            <Pressable key={n} onPress={() => setKm(n)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: n === km ? theme.colors.brandTeal : 'white',
              borderWidth: 1, borderColor: n === km ? theme.colors.brandTeal : '#e5e7eb'
            }}>
              <Text style={{ color: n === km ? 'white' : '#111827', fontWeight: '600' }}>{n} km</Text>
            </Pressable>
          ))}
          {allActivities.slice(0, 6).map((a) => {
            const active = selectedActIds.includes(a.id);
            return (
              <Pressable key={a.id} onPress={() => setSelectedActIds((prev) => active ? prev.filter((x) => x !== a.id) : [...prev, a.id])} style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                backgroundColor: active ? theme.colors.brandYellow : 'white',
                borderWidth: 1, borderColor: active ? theme.colors.brandYellow : '#e5e7eb'
              }}>
                <Text style={{ color: '#111827' }}>{a.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <MapView
        ref={cameraRef}
        style={{ flex: 1 }}
        cameraPosition={cameraPosition}
        markers={markers.map<MapMarker>((m) => ({
          id: m.id,
          title: m.title,
          coordinates: { latitude: m.latitude, longitude: m.longitude },
          overlay: () => renderMarkerOverlay(m),
        }))}
        circles={myCircles}
        properties={{ isMyLocationEnabled: true }}
        uiSettings={{ myLocationButtonEnabled: false }}
        onMapClick={(ev) => {
          if (Platform.OS === 'ios') {
            const coords = extractCoordinates(ev);
            if (!coords) return;
            const { latitude, longitude } = coords;
            setPendingAdd({ lat: latitude, lng: longitude });
            (async () => {
              try {
                const arr = await Location.reverseGeocodeAsync({ latitude, longitude });
                const best = arr?.[0];
                const parts = [best?.name, best?.street, best?.city].filter((value): value is string => Boolean(value));
                setPendingAddr(parts.join(', '));
              } catch {
                setPendingAddr(null);
              }
            })();
          }
        }}
        onMapLongClick={(ev) => {
          if (Platform.OS === 'android') {
            const coords = extractCoordinates(ev);
            if (!coords) return;
            const { latitude, longitude } = coords;
            setPendingAdd({ lat: latitude, lng: longitude });
            (async () => {
              try {
                const arr = await Location.reverseGeocodeAsync({ latitude, longitude });
                const best = arr?.[0];
                const parts = [best?.name, best?.street, best?.city].filter((value): value is string => Boolean(value));
                setPendingAddr(parts.join(', '));
              } catch {
                setPendingAddr(null);
              }
            })();
          }
        }}
        onMarkerClick={(ev) => {
          const id = getMarkerId(ev);
          if (!id) return;
          const match = markers.find((m) => m.id === id);
          if (!match) return;
          if (id.startsWith('cluster:')) {
            // Open a sheet listing venues in this cluster
            const venues = clusterIndex[id] || [];
            setSheet({ venueId: '', title: `${venues.length} places nearby`, lat: match.latitude, lng: match.longitude });
            setSheetRows(venues.map<SheetRow>((v) => ({
              __venue: {
                id: v.id,
                title: v.title,
                latitude: v.latitude,
                longitude: v.longitude,
              },
            })));
            setSheetLoading(false);
            return;
          }
          // Single venue sheet
          setSheet({ venueId: match.id, title: match.title, lat: match.latitude, lng: match.longitude });
          (async () => {
            setSheetLoading(true);
            setSheetRows(null);
            const { data, error } = await supabase
              .from('sessions')
              .select('id, starts_at, ends_at, price_cents, activities(name)')
              .eq('venue_id', match.id)
              .order('starts_at', { ascending: true })
              .limit(10);
            if (!error) setSheetRows((data ?? []) as SheetRow[]);
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
              <Pressable key={n} onPress={() => { setKm(n); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, borderWidth: 1, borderColor: n===km ? '#0d9488' : '#d1d5db', backgroundColor: n===km ? 'rgba(13,148,136,0.08)' : 'white' }}>
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
                {sheetRows?.map((s) => (
                  isVenueRow(s) ? (
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
                            if (!error) setSheetRows((data ?? []) as SheetRow[]);
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
                    <View key={String(s.id)} style={{ borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, borderColor: theme.colors.brandTeal, backgroundColor: 'rgba(22,179,163,0.06)' }}>
                      <Text style={{ fontWeight: '600', color: theme.colors.brandInk }}>{s.activities?.name ?? 'Activity'}</Text>
                      <Text style={{ marginTop: 2 }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
                      {!!s.price_cents && <Text style={{ marginTop: 2 }}>{formatPrice(s.price_cents)}</Text>}
                      <Link href={`/sessions/${s.id}`} asChild>
                        <Pressable style={{ marginTop: 6, backgroundColor: theme.colors.brandTeal, paddingVertical: 8, borderRadius: 8 }}>
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
              <Pressable onPress={() => { setFiltersOpen(false); load({ force: true }); }} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#6366f1' }}>
                <Text style={{ color: '#6366f1' }}>Apply</Text>
              </Pressable>
              <Pressable onPress={() => { setSelectedActIds([]); setFiltersOpen(false); }} style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderColor: '#f59e42' }}>
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
