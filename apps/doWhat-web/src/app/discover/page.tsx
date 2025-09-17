"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ActivityCard from "@/components/ActivityCard";
import { supabase } from "@/lib/supabase/browser";

// Supabase relationship selects can return either an object or array depending on FK cardinality
interface ActivityRef { id: string; name: string }
interface VenueRef { name: string; lat?: number; lng?: number }
interface BaseSession {
  id: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  activities: ActivityRef[] | ActivityRef | null;
  venues: VenueRef[] | VenueRef | null;
}
interface PopularSession extends BaseSession { rsvps?: { id: string }[] | null }
interface PopularSortable extends PopularSession { rsvp_count: number }
type Event = BaseSession;

interface SessionActivityRef { activity_id: string | null }
interface RsvpSessionRef { sessions: SessionActivityRef | SessionActivityRef[] | null }

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Event[]>([]);
  const [popularEvents, setPopularEvents] = useState<Event[]>([]);
  const [nearbyEvents, setNearbyEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Get user location
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

        // Get user's RSVP history to understand preferences
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        
        let userActivityTypes: string[] = [];
        if (uid) {
          const { data: userRsvps } = await supabase
            .from("rsvps")
            .select("sessions(activity_id)")
            .eq("user_id", uid);
          const typed = (userRsvps || []) as unknown as RsvpSessionRef[];
          userActivityTypes = typed
            .map(r => {
              const s = r.sessions;
              if (!s) return null;
              if (Array.isArray(s)) return s[0]?.activity_id || null;
              return s.activity_id;
            })
            .filter((v): v is string => Boolean(v));
        }

        // Get upcoming events
  const { data: upcomingEvents } = await supabase
          .from("sessions")
          .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name)")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(50);

        if (!upcomingEvents) return;

        // Get popular events (most RSVPs)
        const { data: popularData } = await supabase
          .from("sessions")
          .select(`
            id, price_cents, starts_at, ends_at, 
            activities(id,name), venues(name),
            rsvps(id)
          `)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(20);

        if (popularData) {
          const typedPopular = popularData as PopularSession[];
          const sortedByRsvps: Event[] = typedPopular
            .map<PopularSortable>(ev => ({ ...ev, rsvp_count: ev.rsvps?.length ?? 0 }))
            .sort((a, b) => b.rsvp_count - a.rsvp_count)
            .slice(0, 6)
            .map(({ rsvps: _r, rsvp_count: _c, ...rest }) => rest);
          setPopularEvents(sortedByRsvps);
        }

        // Recommendations based on user preferences
  let recommendedEvents = upcomingEvents as Event[];
        if (userActivityTypes.length > 0) {
          recommendedEvents = upcomingEvents.filter(event => {
            const activities = event.activities;
            if (!activities) return false;
            const activityId = Array.isArray(activities) 
              ? activities[0]?.id 
              : (activities as { id: string; name: string }).id;
            return userActivityTypes.includes(activityId || '');
          });
        }
        
        // If no preference-based recommendations, show random selection
        if (recommendedEvents.length === 0) {
          recommendedEvents = upcomingEvents
            .sort(() => Math.random() - 0.5)
            .slice(0, 6);
        }
        
        setRecommendations(recommendedEvents.slice(0, 6));
        
        // Nearby events (if location available)
        if (userLocation) {
          const { data: nearbyData } = await supabase
            .from("sessions")
            .select(`
              id, price_cents, starts_at, ends_at,
              activities(id,name), venues(name, lat, lng)
            `)
            .gte("starts_at", new Date().toISOString())
            .not("venues.lat", "is", null)
            .not("venues.lng", "is", null)
            .order("starts_at", { ascending: true });

          if (nearbyData) {
            const typedNearby = nearbyData as Event[];
            const extractVenue = (v: Event["venues"]): VenueRef | null => {
              if (!v) return null;
              return Array.isArray(v) ? (v[0] || null) : v;
            };
            const nearbyFiltered = typedNearby
              .map(ev => ({ ev, venue: extractVenue(ev.venues) }))
              .filter(item => item.venue?.lat != null && item.venue?.lng != null)
              .map(item => ({ ...item.ev, venue: item.venue as VenueRef }))
              .filter(ev => {
                const venue = extractVenue(ev.venues);
                if (!venue?.lat || !venue.lng) return false;
                const distance = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  venue.lat,
                  venue.lng
                );
                return distance <= 25; // Within 25km
              })
              .sort((a, b) => {
                const venueA = extractVenue(a.venues)!;
                const venueB = extractVenue(b.venues)!;
                const distA = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  venueA.lat!,
                  venueA.lng!
                );
                const distB = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  venueB.lat!,
                  venueB.lng!
                );
                return distA - distB;
              })
              .slice(0, 6);
            setNearbyEvents(nearbyFiltered);
          }
        }
      } catch (error) {
        console.error("Error loading recommendations:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [userLocation?.lat, userLocation?.lng]);

  // Calculate distance between two points using Haversine formula
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

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-gray-200 rounded mb-6"></div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Discover Events</h1>
        <Link href="/" className="text-brand-teal hover:underline">
          ← Back to Home
        </Link>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold text-gray-800">
            🎯 Recommended for You
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((event) => (
              <ActivityCard key={event.id} s={{
                ...event,
                activities: event.activities || undefined,
                venues: event.venues || undefined
              }} />
            ))}
          </div>
        </section>
      )}

      {/* Popular Events */}
      {popularEvents.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold text-gray-800">
            🔥 Trending Events
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {popularEvents.map((event) => (
              <ActivityCard key={event.id} s={{
                ...event,
                activities: event.activities || undefined,
                venues: event.venues || undefined
              }} />
            ))}
          </div>
        </section>
      )}

      {/* Nearby Events */}
      {nearbyEvents.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold text-gray-800">
            📍 Near You
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {nearbyEvents.map((event) => (
              <ActivityCard key={event.id} s={{
                ...event,
                activities: event.activities || undefined,
                venues: event.venues || undefined
              }} />
            ))}
          </div>
        </section>
      )}

      {recommendations.length === 0 && popularEvents.length === 0 && nearbyEvents.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-800">No events found</h3>
          <p className="text-gray-600 mb-4">
            There are no upcoming events to recommend right now.
          </p>
          <Link 
            href="/create"
            className="inline-block rounded-lg bg-brand-teal px-6 py-3 text-white hover:bg-teal-700"
          >
            Create the First Event
          </Link>
        </div>
      )}
    </main>
  );
}
