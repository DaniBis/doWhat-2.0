import { supabase } from "../lib/supabase";
import { ensureBackgroundLocation, getLastKnownBackgroundLocation } from "../lib/bg-location";
import type { ActivityRow } from "@dowhat/shared";
import { formatPrice, formatDateRange } from "@dowhat/shared";
import * as Location from 'expo-location';
import { Link, useFocusEffect, router } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, ScrollView } from "react-native";
import AuthButtons from "../components/AuthButtons";
import RsvpBadges from "../components/RsvpBadges";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";

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
};

type NearbyActivity = { id: string; name: string; count: number };

function HomeScreen() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [session, setSession] = useState<any>(null);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredActivities, setFilteredActivities] = useState<NearbyActivity[]>([]);

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
      const { data: auth } = await supabase.auth.getSession();
      setSession(auth.session ?? null);
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
          setLng(String(latNow));
        }
      } catch {}
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
    ensureBackgroundLocation().catch(() => {});
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

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

  // Simulate search suggestions (replace with real API)
  const searchSuggestions = activities ? activities
    .filter(activity =>
      activity.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      activity.name.toLowerCase() !== searchQuery.toLowerCase()
    )
    .slice(0, 3)
    .map(activity => activity.name) : [];

  useEffect(() => {
    if (activities) {
      const filtered = activities.filter(activity =>
        activity.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredActivities(filtered);
    }
  }, [activities, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilter = () => {
    router.push('/filter');
  };

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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, backgroundColor: '#2C3E50' }}>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fbbf24', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>👤</Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 }}>Activities</Text>
          <TouchableOpacity onPress={() => router.push('/map')}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#38bdf8', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>🗺️</Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Search Bar */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <SearchBar
            onSearch={(query) => setSearchQuery(query)}
            onFilter={handleFilter}
            suggestedSearches={searchSuggestions}
            placeholder="Search for activities..."
          />
        </View>

        {/* Activity Grid */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          {filteredActivities.length === 0 && searchQuery ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
              <EmptyState
                icon="search"
                title="No results found"
                subtitle={`No activities found for "${searchQuery}"`}
                actionText="Clear Search"
                onAction={() => setSearchQuery('')}
              />
            </View>
          ) : (
            <View style={{ flex: 1, paddingVertical: 16 }}>
              {/* Section Title */}
              <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#1F2937' }}>
                  {searchQuery ? `Results for "${searchQuery}"` : 'Nearby Activities'}
                </Text>
                <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>
                  {searchQuery 
                    ? `${filteredActivities.length} activities found`
                    : `${activities.length} activities in your area`
                  }
                </Text>
              </View>
              
              {/* Activities Grid */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 0 }}>
                  {(searchQuery ? filteredActivities : activities).map((a, i) => {
                const visual = activityVisuals[a.name] || { icon: '🎯', color: '#fbbf24' };
                return (
                  <Link key={a.id} href={`/activities/${a.id}`} asChild>
                    <Pressable style={{ width: 100, alignItems: 'center', margin: 12 }}>
                      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }}>
                        <Text style={{ fontSize: 38 }}>{visual.icon}</Text>
                      </View>
                      <Text numberOfLines={1} style={{ marginTop: 10, fontWeight: '700', fontSize: 16 }}>{a.name}</Text>
                    </Pressable>
                  </Link>
                );
              })}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
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

export default HomeScreen;
