import { supabase } from "../lib/supabase";
import { ensureBackgroundLocation, getLastKnownBackgroundLocation } from "../lib/bg-location";
import type { ActivityRow } from "@dowhat/shared";
import { formatPrice, formatDateRange } from "@dowhat/shared";
import * as Location from 'expo-location';
import { Link, useFocusEffect, router } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, Dimensions } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import Brand from '../components/Brand';
import ActivityIcon from '../components/ActivityIcon';
import { theme } from '@dowhat/shared/src/theme';
import { Ionicons } from '@expo/vector-icons';
import AuthButtons from "../components/AuthButtons";
import RsvpBadges from "../components/RsvpBadges";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";

const { width: screenWidth } = Dimensions.get('window');

// Map activity names/ids to icons and colors (customize as needed)
const activityVisuals: Record<string, { icon: string; color: string; bgColor: string }> = {
  'Rock Climbing': { icon: '🧗', color: '#FF6B35', bgColor: '#FFF4F1' },
  'Running': { icon: '🏃', color: '#4ECDC4', bgColor: '#F0FDFC' },
  'Yoga': { icon: '🧘', color: '#45B7D1', bgColor: '#F0F9FF' },
  'Cycling': { icon: '🚴', color: '#96CEB4', bgColor: '#F0FDF4' },
  'Swimming': { icon: '🏊', color: '#FFEAA7', bgColor: '#FFFBEB' },
  'Hiking': { icon: '🥾', color: '#DDA0DD', bgColor: '#FAF5FF' },
  'Soccer': { icon: '⚽', color: '#FF7675', bgColor: '#FEF2F2' },
  'Basketball': { icon: '🏀', color: '#74B9FF', bgColor: '#EFF6FF' },
  'Tennis': { icon: '🎾', color: '#00B894', bgColor: '#ECFDF5' },
  'Golf': { icon: '⛳', color: '#FDCB6E', bgColor: '#FFFBEB' },
  'Skiing': { icon: '⛷️', color: '#6C5CE7', bgColor: '#F5F3FF' },
  'Surfing': { icon: '🏄', color: '#00CED1', bgColor: '#F0FDFA' },
};

const defaultVisual = { icon: '🎯', color: '#FF6B35', bgColor: '#FFF4F1' };

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
    try {
      if (latNow == null || lngNow == null) { setActivities([]); return; }
      const base = process.env.EXPO_PUBLIC_WEB_URL || 'http://localhost:3002';
      const url = new URL('/api/nearby', base);
      url.searchParams.set('lat', String(latNow));
      url.searchParams.set('lng', String(lngNow));
      url.searchParams.set('radius', '2500');
      const res = await fetch(url.toString());
      const json = await res.json();
      const list = (json?.activities || []) as Array<{ id: string; name: string }>;
      // Group by activity id to get a lightweight "count"
      const grouped = Object.values(
        list.reduce((acc: Record<string, NearbyActivity>, it: any) => {
          const key = it.id || it.name;
          if (!acc[key]) acc[key] = { id: it.id || key, name: it.name, count: 0 };
          acc[key].count += 1; return acc;
        }, {})
      ).sort((a: any, b: any) => b.count - a.count);
      setActivities(grouped);
    } catch {
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
          setLng(String(lngNow));
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
      
      // Get current sessions with future start times
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("sessions")
        .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name)")
        .gte("starts_at", now) // Only future sessions
        .order("starts_at", { ascending: true })
        .limit(20);
      if (error) setError(error.message);
      else setRows((data ?? []) as ActivityRow[]);
    } catch (err) {
      console.error('Home screen load error:', err);
      setError('Failed to load activities. Please check your internet connection and try again.');
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        
        {/* Hero Section */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={{
            flex: 1,
            paddingHorizontal: 24,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Welcome Hero */}
          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <View style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}>
              <Text style={{ fontSize: 48 }}>🎯</Text>
            </View>
            
            <Text style={{
              fontSize: 32,
              fontWeight: '800',
              color: '#FFFFFF',
              textAlign: 'center',
              marginBottom: 12,
              letterSpacing: -0.5,
            }}>
              doWhat
            </Text>
            
            <Text style={{
              fontSize: 18,
              color: 'rgba(255,255,255,0.9)',
              textAlign: 'center',
              lineHeight: 26,
              maxWidth: 280,
            }}>
              Discover amazing activities and connect with like-minded people in your area
            </Text>
          </View>

          {/* Feature Highlights */}
          <View style={{ width: '100%', marginBottom: 40 }}>
            {[
              { icon: '📍', title: 'Find Local Activities', desc: 'Discover events happening around you' },
              { icon: '👥', title: 'Meet People', desc: 'Connect with others who share your interests' },
              { icon: '🎨', title: 'Create Events', desc: 'Organize your own activities and invite others' },
            ].map((feature, index) => (
              <View key={index} style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
              }}>
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                }}>
                  <Text style={{ fontSize: 20 }}>{feature.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#FFFFFF',
                    marginBottom: 2,
                  }}>
                    {feature.title}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: 18,
                  }}>
                    {feature.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Auth Section */}
          <View style={{
            width: '100%',
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
          }}>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#1F2937',
              marginBottom: 8,
              textAlign: 'center',
            }}>
              Get Started
            </Text>
            <Text style={{
              fontSize: 14,
              color: '#6B7280',
              textAlign: 'center',
              marginBottom: 20,
              lineHeight: 20,
            }}>
              Sign in to discover activities and start connecting with your community
            </Text>
            <AuthButtons />
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // New design: header + discover grid + (optional) upcoming sessions
  {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <StatusBar barStyle="light-content" backgroundColor="#2C3E50" />
        
        {/* Modern Header */}
        <LinearGradient
          colors={[theme.colors.brandTeal, theme.colors.brandTealDark]}
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 20,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="person" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            
            <Brand />
            
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/map')}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="map" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={{ marginTop: 8 }}>
            <SearchBar
              onSearch={(query) => setSearchQuery(query)}
              onFilter={handleFilter}
              suggestedSearches={searchSuggestions}
              placeholder="Search for activities..."
            />
          </View>
        </LinearGradient>

        {/* Quick Actions */}
        <View style={{
          flexDirection: 'row',
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 12,
          gap: 8,
        }}>
          <TouchableOpacity
            onPress={() => router.push('/people-filter')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 12,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Ionicons name="people" size={16} color="#8B5CF6" />
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#8B5CF6',
              marginLeft: 8,
            }}>
              Find People
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/filter')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 12,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Ionicons name="options" size={16} color="#3B82F6" />
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#3B82F6',
              marginLeft: 8,
            }}>
              Filters
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => router.push('/add-event')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#10B981',
              borderRadius: 12,
              padding: 12,
              shadowColor: '#10B981',
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#FFFFFF',
              marginLeft: 8,
            }}>
              Create Event
            </Text>
          </TouchableOpacity>
        </View>

        {/* Activities Grid */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredActivities.length === 0 && searchQuery ? (
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: 60,
            }}>
              <EmptyState
                icon="search"
                title="No results found"
                subtitle={`No activities found for "${searchQuery}"`}
                actionText="Clear Search"
                onAction={() => setSearchQuery('')}
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              {/* Section Header */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: '#1F2937',
                  marginBottom: 6,
                }}>
                  {searchQuery ? `Results for "${searchQuery}"` : 'Nearby Activities'}
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  fontWeight: '500',
                }}>
                  {searchQuery 
                    ? `${filteredActivities.length} activities found`
                    : `${activities.length} activities in your area`
                  }
                </Text>
              </View>
              
              {/* Activities Grid */}
              <View style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                {(searchQuery ? filteredActivities : activities).map((activity, index) => {
                  const visual = activityVisuals[activity.name] || defaultVisual;
                  return (
                    <Link key={activity.id} href={`/activities/${activity.id}`} asChild>
                      <Pressable style={{
                        width: (screenWidth - 56) / 2, // Account for padding and gap
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 4,
                        marginBottom: 16,
                      }}>
                        {/* Activity Icon Container */}
                        <View style={{
                          width: 84,
                          height: 84,
                          borderRadius: 42,
                          backgroundColor: theme.colors.brandYellow,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 16,
                          ...theme.shadow.card,
                        }}>
                          <ActivityIcon name={activity.name} size={32} color="#111827" />
                        </View>
                        
                        {/* Activity Info */}
                        <Text numberOfLines={2} style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: '#1F2937',
                          textAlign: 'center',
                          lineHeight: 22,
                          marginBottom: 8,
                        }}>
                          {activity.name}
                        </Text>
                        
                        {/* Activity Count */}
                        <View style={{
                          backgroundColor: visual.color + '15',
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}>
                          <Text style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: visual.color,
                          }}>
                            {activity.count} event{activity.count !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </Pressable>
                    </Link>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
        {/* Upcoming sessions */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 }}>
            Upcoming Sessions
          </Text>
          {rows.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 16 }}>
              <Text style={{ color: '#6B7280' }}>No sessions yet. Be the first to create one!</Text>
            </View>
          ) : (
            rows.slice(0, 6).map((s) => (
              <View key={String(s.id)} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{s.activities?.name ?? 'Activity'}</Text>
                <Text style={{ color: '#6B7280', marginTop: 2 }}>{s.venues?.name ?? 'Venue'}</Text>
                <Text style={{ marginTop: 4 }}>{formatPrice(s.price_cents)}</Text>
                <Text style={{ marginTop: 2, color: '#374151' }}>{formatDateRange(s.starts_at, s.ends_at)}</Text>
                <RsvpBadges activityId={(s as any)?.activities?.id ?? null} />
                <Link href={`/sessions/${s.id}`} asChild>
                  <Pressable style={{ marginTop: 10, padding: 10, backgroundColor: '#10B981', borderRadius: 10 }}>
                    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>View details</Text>
                  </Pressable>
                </Link>
              </View>
            ))
          )}
        </View>
      </SafeAreaView>
    );
  }
}

export default HomeScreen;
