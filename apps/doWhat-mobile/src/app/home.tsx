import { supabase } from "../lib/supabase";
import { ensureBackgroundLocation, getLastKnownBackgroundLocation } from "../lib/bg-location";

import type { ActivityRow } from "@dowhat/shared";
import { formatPrice, formatDateRange } from "@dowhat/shared";
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Link, useFocusEffect } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, Platform } from "react-native";

// Map activity names/ids to icons and colors (customize as needed)
const activityVisuals: Record<string, { icon: string; color: string }> = {
  'Rock Climbing': { icon: '🧗', color: '#fbbf24' },
  'Running': { icon: '🏃', color: '#f59e42' },
  'Yoga': { icon: '🧘', color: '#a3e635' },
  'Cycling': { icon: '🚴', color: '#38bdf8' },
  'Swimming': { icon: '🏊', color: '#60a5fa' },
  'Hiking': { icon: '🥾', color: '#f87171' },
  'Soccer': { icon: '⚽', color: '#fbbf24' },
  'Basketball': { icon: '🏀', color: '#f59e42' },
  // Add more as needed
};
import AuthButtons from "../components/AuthButtons";
import RsvpBadges from "../components/RsvpBadges";

type NearbyActivity = { id: string; name: string; count: number };

export default function Index() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [session, setSession] = useState<any>(null);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [bgPerm, setBgPerm] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [startingBg, setStartingBg] = useState(false);

  async function fetchNearbyActivities(latNow: number | null, lngNow: number | null) {
    const { data: near } = await supabase.rpc('sessions_nearby', {
      lat: latNow ?? null,
      lng: lngNow ?? null,
      p_km: 25,
      activities: null,
      day: null,
    });
    const arr = (near ?? []) as any[];
    if (arr.length) {
      const map: Record<string, NearbyActivity> = {};
      for (const r of arr) {
        if (!map[r.activity_id]) map[r.activity_id] = { id: r.activity_id, name: r.activity_name, count: 0 };
        map[r.activity_id].count += 1;
      }
      setActivities(Object.values(map).sort((a,b)=> b.count - a.count));
    } else {
      setActivities([]);
    }
  }

  async function load() {
    setError(null);
    try {
      // ensure auth state
      const { data: auth } = await supabase.auth.getSession();
      setSession(auth.session ?? null);

      // try to grab a quick position (non-blocking UI) and use it immediately
      let latNow: number | null = null;
      let lngNow: number | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (last?.coords) {
          latNow = Number(last.coords.latitude.toFixed(6));
          lngNow = Number(last.coords.longitude.toFixed(6));
          setLat(String(latNow));
          setLng(String(lngNow));
        }
      } catch {}

      // If we still don't have a coordinate, try the background-stored one
      if (latNow == null || lngNow == null) {
        try {
          const cached = await getLastKnownBackgroundLocation();
          if (cached) {
            latNow = cached.lat;
            lngNow = cached.lng;
            setLat(String(latNow));
            setLng(String(lngNow));
          }
        } catch {}
      }
      if (latNow == null || lngNow == null) {
        try {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id ?? null;
          if (uid) {
            const { data } = await supabase.from('profiles').select('last_lat,last_lng').eq('id', uid).maybeSingle();
            const la = (data as any)?.last_lat; const ln = (data as any)?.last_lng;
            if (la != null && ln != null) { latNow = la; lngNow = ln; setLat(String(la)); setLng(String(ln)); }
          }
        } catch {}
      }

      // Preload activities nearby (aggregate from RPC)
      await fetchNearbyActivities(latNow, lngNow);

      const { data, error } = await supabase
        .from("sessions")
        .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name)")
        .order("starts_at", { ascending: true })
        .limit(20);
      if (error) setError(error.message);
      else setRows((data ?? []) as ActivityRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Start background location in parallel; ignore if user declines.
    ensureBackgroundLocation().catch(() => {});
    load();
    // Also read background permission status to show a banner
    (async () => {
      try { const b = await Location.getBackgroundPermissionsAsync(); setBgPerm(b.status as any); } catch {}
    })();
  }, []);

  // Refresh list when screen regains focus (e.g., after background updates)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  // Foreground watcher keeps activities fresh while app is open
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 100 },
          (loc) => {
            const la = Number(loc.coords.latitude.toFixed(6));
            const ln = Number(loc.coords.longitude.toFixed(6));
            setLat(String(la));
            setLng(String(ln));
          }
        );
      } catch {}
    })();
    return () => { sub?.remove(); };
  }, []);

  // When lat/lng state changes, refresh nearby activities
  useEffect(() => {
    const la = parseFloat(lat); const ln = parseFloat(lng);
    if (!Number.isNaN(la) && !Number.isNaN(ln)) {
      fetchNearbyActivities(la, ln);
    }
  }, [lat, lng]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) {
    return <Text style={{ padding: 16, color: "red" }}>Error: {error}</Text>;
  }

  if (loading) {
    return (
      <View style={{ padding: 12, gap: 12 }}>
        {[0,1,2].map((i) => (
          <View key={i} style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
            <View style={{ height: 16, width: 120, backgroundColor: '#e5e7eb', borderRadius: 4 }} />
            <View style={{ height: 12, width: 180, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
            <View style={{ height: 12, width: 80, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
            <View style={{ height: 12, width: 220, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8 }} />
          </View>
        ))}
      </View>
    );
  }

  // Gate: sign-in required before showing activities/sessions
  if (!session) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Welcome to doWhat</Text>
        <Text>Sign in to discover activities near you.</Text>
        <View style={{ marginTop: 12 }}>
          <AuthButtons />
        </View>
      </View>
    );
  }

  // Show activities grid if we have a nearby list
  if (activities && activities.length) {
    return (
      <View style={{ flex: 1, padding: 12 }}>
        <View style={{ marginBottom: 12 }}>
          <AuthButtons />
        </View>
        {bgPerm !== 'granted' && (
          <View style={{ borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: '#f59e0b' }}>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Enable background location</Text>
            <Text style={{ color: '#4b5563' }}>Allow “Always” to keep nearby activities fresh even when the app is closed.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={async () => { setStartingBg(true); await ensureBackgroundLocation(); setStartingBg(false); const b = await Location.getBackgroundPermissionsAsync(); setBgPerm(b.status as any); if (Platform.OS==='ios' && b.status!== 'granted') Linking.openSettings?.(); }}
                style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, opacity: startingBg ? 0.6 : 1 }}
                disabled={startingBg}
              >
                <Text>{startingBg ? 'Requesting…' : 'Enable'}</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openSettings?.()} style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text>Open Settings</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Activities near you</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {activities.map((a) => {
            const visual = activityVisuals[a.name] || { icon: '🎯', color: '#fbbf24' };
            return (
              <Link key={a.id} href={`/activities/${a.id}`} asChild>
                <Pressable style={{ width: '33%', padding: 8, alignItems: 'center' }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>{visual.icon}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 6, fontWeight: '600' }}>{a.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>{a.count} places/events</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
        {/* fallback section */}
        {!activities.length && (
          <Text style={{ marginTop: 12 }}>No activities found nearby yet.</Text>
        )}
      </View>
    );
  }

  if (!rows.length) {
    return <Text style={{ padding: 16 }}>No sessions yet.</Text>;
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, gap: 12 }}
      data={rows}
      keyExtractor={(s) => String(s.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item: s }) => (
        <View style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            {s.activities?.name ?? "Running"}
          </Text>
          <Text style={{ marginTop: 4 }}>{s.venues?.name ?? "Venue"}</Text>
          <Text style={{ marginTop: 4 }}>{formatPrice(s.price_cents)}</Text>
          <Text style={{ marginTop: 4 }}>
            {formatDateRange(s.starts_at, s.ends_at)}
          </Text>
          <RsvpBadges activityId={(s as any)?.activities?.id ?? null} />
          <Link href={`/sessions/${s.id}`} asChild>
            <Pressable style={{ marginTop: 12, padding: 10, backgroundColor: "#16a34a", borderRadius: 8 }}>
              <Text style={{ color: "white", textAlign: "center" }}>View details</Text>
            </Pressable>
          </Link>
        </View>
      )}
      ListHeaderComponent={
        <>
          <AuthButtons />
          <Link href="/(tabs)/profile" asChild>
            <Pressable style={{ padding: 8, borderWidth: 1, borderRadius: 8, marginHorizontal: 12, marginBottom: 8 }}>
              <Text style={{ textAlign: 'center' }}>Profile</Text>
            </Pressable>
          </Link>
          <Link href="/my-rsvps" asChild>
            <Pressable style={{ padding: 8, borderWidth: 1, borderRadius: 8, marginHorizontal: 12, marginBottom: 8 }}>
              <Text style={{ textAlign: 'center' }}>My RSVPs</Text>
            </Pressable>
          </Link>
          <Link href="/(tabs)/nearby" asChild>
            <Pressable style={{ padding: 8, borderWidth: 1, borderRadius: 8, marginHorizontal: 12 }}>
              <Text style={{ textAlign: 'center' }}>Find nearby activities</Text>
            </Pressable>
          </Link>
        </>
      }
    />
  );
}
