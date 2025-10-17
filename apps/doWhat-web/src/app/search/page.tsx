"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import ActivityCard from "@/components/ActivityCard";
import { supabase } from "@/lib/supabase/browser";

type Event = {
  id: string;
  created_by?: string | null;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  activities?:
    | { id: string; name: string; description?: string | null; activity_types?: string[] | null }
    | { id: string; name: string; description?: string | null; activity_types?: string[] | null }[]
    | null;
  venues?: { name: string; lat?: number; lng?: number }[] | { name: string; lat?: number; lng?: number } | null;
  description?: string;
};

type Activity = { id: string; name: string };
type Venue = { id: string; name: string };

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Filters
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
  });
  const [maxDistance, setMaxDistance] = useState<number>(25);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'distance' | 'popularity'>('date');

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Silent fail
        }
      );
    }
  }, []);

  // Load activities and venues for filters
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth?.user?.id ?? null);

      const [activitiesRes, venuesRes] = await Promise.all([
        supabase.from('activities').select('id, name').order('name'),
        supabase.from('venues').select('id, name').order('name'),
      ]);
      
      if (activitiesRes.data) setActivities(activitiesRes.data);
      if (venuesRes.data) setVenues(venuesRes.data);
    })();
  }, []);

  // Search function
  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      let queryBuilder = supabase
        .from('sessions')
        .select(`
          id, created_by, price_cents, starts_at, ends_at, description,
          activities(id, name, description, activity_types),
          venues(id, name, lat, lng)
        `)
        .gte('starts_at', new Date(dateRange.start).toISOString())
        .lte('starts_at', new Date(dateRange.end + 'T23:59:59').toISOString())
        .gte('price_cents', priceRange[0] * 100)
        .lte('price_cents', priceRange[1] * 100);

      // Filter by activities
      if (selectedActivityIds.length > 0) {
        queryBuilder = queryBuilder.in('activity_id', selectedActivityIds);
      }

      // Filter by venues
      if (selectedVenueIds.length > 0) {
        queryBuilder = queryBuilder.in('venue_id', selectedVenueIds);
      }

      // Text search
      if (query.trim()) {
        queryBuilder = queryBuilder.or(`
          activities.name.ilike.%${query}%,
          venues.name.ilike.%${query}%,
          description.ilike.%${query}%
        `);
      }

      const { data, error } = await queryBuilder.limit(100);
      
      if (error) throw error;
      
  let filteredResults: Event[] = (data || []) as Event[];

      // Filter by distance if location is available
      if (userLocation && maxDistance < 1000) {
        filteredResults = filteredResults.filter((event) => {
          const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
          if (!venue?.lat || !venue?.lng) return true; // Include events without location
          const distance = calculateDistance(userLocation.lat, userLocation.lng, venue.lat, venue.lng);
          return distance <= maxDistance;
        });
      }

      // Sort results
      switch (sortBy) {
        case 'price':
          filteredResults.sort((a, b) => a.price_cents - b.price_cents);
          break;
        case 'distance':
          if (userLocation) {
            filteredResults.sort((a, b) => {
              const va = Array.isArray(a.venues) ? a.venues[0] : a.venues;
              const vb = Array.isArray(b.venues) ? b.venues[0] : b.venues;
              if (!va?.lat || !va?.lng) return 1;
              if (!vb?.lat || !vb?.lng) return -1;
              const distA = calculateDistance(userLocation.lat, userLocation.lng, va.lat, va.lng);
              const distB = calculateDistance(userLocation.lat, userLocation.lng, vb.lat, vb.lng);
              return distA - distB;
            });
          }
          break;
        case 'date':
        default:
          filteredResults.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
          break;
      }

      setResults(filteredResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, selectedActivityIds, selectedVenueIds, priceRange, dateRange, maxDistance, userLocation, sortBy]);

  // Perform search when filters change
  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Update URL with search query
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [query, router]);

  function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Search Events</h1>
        <Link href="/" className="text-brand-teal hover:underline">
          ← Back to Home
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* Search Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Events
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by activity, venue, or description..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        {/* Filters Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Activity Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Activities
            </label>
            <div className="max-h-32 overflow-y-auto space-y-2 border rounded-lg p-2">
              {activities.map((activity) => (
                <label key={activity.id} className="flex items-center text-sm">
                  <input
                    type="checkbox"
                    checked={selectedActivityIds.includes(activity.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedActivityIds([...selectedActivityIds, activity.id]);
                      } else {
                        setSelectedActivityIds(selectedActivityIds.filter(id => id !== activity.id));
                      }
                    }}
                    className="mr-2 rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
                  />
                  {activity.name}
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Price Range (EUR)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={priceRange[0]}
                  onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  placeholder="Min"
                />
                <input
                  type="number"
                  min="0"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="space-y-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Distance Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Distance (km) {userLocation ? '' : '(Location not available)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="100"
                value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                disabled={!userLocation}
                className="flex-1"
              />
              <span className="text-sm text-gray-600 w-12">{maxDistance}km</span>
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="date">Date</option>
              <option value="price">Price</option>
              {userLocation && <option value="distance">Distance</option>}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {loading ? 'Searching...' : `${results.length} events found`}
        </h2>
        
        {(selectedActivityIds.length > 0 || selectedVenueIds.length > 0 || query) && (
          <button
            onClick={() => {
              setQuery('');
              setSelectedActivityIds([]);
              setSelectedVenueIds([]);
              setPriceRange([0, 100]);
              setDateRange({
                start: new Date().toISOString().split('T')[0],
                end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              });
            }}
            className="text-sm text-brand-teal hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-200"></div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {(() => {
                const grouped = new Map<
                  string,
                  {
                    activity: {
                      id?: string;
                      name?: string | null;
                      description?: string | null;
                      activity_types?: string[] | null;
                    };
                    sessions: Array<{
                      id?: string;
                      created_by?: string | null;
                      price_cents?: number | null;
                      starts_at?: string | null;
                      ends_at?: string | null;
                      venues?: { name?: string | null } | { name?: string | null }[] | null;
                    }>;
                  }
                >();

                for (const event of results) {
                  const activityRel = Array.isArray(event.activities)
                    ? event.activities[0]
                    : event.activities;
                  if (!activityRel) continue;
                  const key = activityRel.id ?? activityRel.name ?? event.id;
                  if (!grouped.has(key)) {
                    grouped.set(key, {
                      activity: {
                        id: activityRel.id,
                        name: activityRel.name,
                        description: activityRel.description ?? null,
                        activity_types: activityRel.activity_types ?? null,
                      },
                      sessions: [],
                    });
                  }
                  grouped.get(key)!.sessions.push({
                    id: event.id,
                    created_by: event.created_by ?? null,
                    price_cents: event.price_cents ?? null,
                    starts_at: event.starts_at,
                    ends_at: event.ends_at,
                    venues: event.venues ?? null,
                  });
                }

                const cards = Array.from(grouped.values()).sort((a, b) => {
                  const earliest = (sessions: typeof a.sessions) =>
                    sessions.reduce((min, session) => {
                      if (!session.starts_at) return min;
                      const time = new Date(session.starts_at).getTime();
                      return min == null || time < min ? time : min;
                    }, null as number | null);
                  const aStart = earliest(a.sessions);
                  const bStart = earliest(b.sessions);
                  if (aStart == null && bStart == null) return 0;
                  if (aStart == null) return 1;
                  if (bStart == null) return -1;
                  return aStart - bStart;
                });

                return cards.map((group) => {
                  const key =
                    group.activity.id ??
                    group.activity.name ??
                    group.sessions[0]?.id ??
                    `${group.sessions[0]?.starts_at ?? "group"}`;
                  return (
                    <ActivityCard
                      key={key}
                      activity={group.activity}
                      sessions={group.sessions}
                      currentUserId={userId}
                    />
                  );
                });
              })()}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-800">No events found</h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your search criteria or filters.
          </p>
          <Link 
            href="/create"
            className="inline-block rounded-lg bg-brand-teal px-6 py-3 text-white hover:bg-teal-700"
          >
            Create New Event
          </Link>
        </div>
      )}
    </div>
  );
}
