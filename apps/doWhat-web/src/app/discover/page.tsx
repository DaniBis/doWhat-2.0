"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ActivityCard from "@/components/ActivityCard";
import { supabase } from "@/lib/supabase/browser";
import type { RecommendationResponse, RecommendationSession, RecommendationVenueRef } from "@/types/recommendations";

type Event = RecommendationSession;
type VenueRef = RecommendationVenueRef;
type PopularSession = Event & { session_attendees?: { status: string | null }[] | null };
type PopularSortable = PopularSession & { attendee_count: number };

interface SessionActivityRef { activity_id: string | null }
interface AttendanceSessionRef { sessions: SessionActivityRef | SessionActivityRef[] | null }

const RECOMMENDATION_SECTION_LIMIT = 6;

const getEventActivityId = (event: Event): string | null => {
  const rel = event.activities;
  if (!rel) return null;
  const primary = Array.isArray(rel) ? rel[0] : rel;
  return primary?.id ?? null;
};

const selectFallbackRecommendations = (events: Event[], userActivityTypes: string[]): Event[] => {
  if (!events.length) return [];
  if (userActivityTypes.length) {
    const filtered = events.filter((event) => {
      const activityId = getEventActivityId(event);
      return Boolean(activityId && userActivityTypes.includes(activityId));
    });
    if (filtered.length) {
      return filtered.slice(0, RECOMMENDATION_SECTION_LIMIT);
    }
  }
  return [...events].sort(() => Math.random() - 0.5).slice(0, RECOMMENDATION_SECTION_LIMIT);
};
export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Event[]>([]);
  const [popularEvents, setPopularEvents] = useState<Event[]>([]);
  const [nearbyEvents, setNearbyEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
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
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;
        if (!cancelled) {
          setUserId(uid);
        }

        let userActivityTypes: string[] = [];
        if (uid) {
          const { data: userAttendance } = await supabase
            .from("session_attendees")
            .select("sessions(activity_id)")
            .eq("user_id", uid)
            .neq("status", "declined");
          const typed = (userAttendance || []) as unknown as AttendanceSessionRef[];
          userActivityTypes = typed
            .map((r) => {
              const s = r.sessions;
              if (!s) return null;
              if (Array.isArray(s)) return s[0]?.activity_id || null;
              return s.activity_id;
            })
            .filter((v): v is string => Boolean(v));
        }

        const { data: upcomingEvents } = await supabase
          .from("sessions")
          .select(
            "id, created_by, price_cents, starts_at, ends_at, venue_id, activities(id,name,description,activity_types), venues(id,name,lat:lat,lng:lng)"
          )
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(50);

        if (!upcomingEvents) {
          return;
        }

        const typedUpcoming = upcomingEvents as Event[];

        const { data: popularData } = await supabase
          .from("sessions")
          .select(`
            id, created_by, price_cents, starts_at, ends_at, venue_id,
            activities(id,name,description,activity_types), venues(id,name,lat:lat,lng:lng),
            session_attendees(status)
          `)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(20);

        if (popularData && !cancelled) {
          const typedPopular = popularData as PopularSession[];
          const sortedByAttendance: Event[] = typedPopular
            .map<PopularSortable>((ev) => ({ ...ev, attendee_count: ev.session_attendees?.length ?? 0 }))
            .sort((a, b) => b.attendee_count - a.attendee_count)
            .slice(0, 6)
            .map((ev) => {
              const { session_attendees, attendee_count, ...rest } = ev;
              void session_attendees;
              void attendee_count;
              return rest;
            });
          setPopularEvents(sortedByAttendance);
        }

        const fetchRecommendationSessions = async (): Promise<Event[] | null> => {
          if (!uid) return null;
          try {
            const params = new URLSearchParams();
            params.set("limit", "12");
            if (userLocation?.lat != null && userLocation?.lng != null) {
              params.set("lat", userLocation.lat.toFixed(6));
              params.set("lng", userLocation.lng.toFixed(6));
            }
            const query = params.toString();
            const endpoint = query ? `/api/recommendations?${query}` : "/api/recommendations";
            const response = await fetch(endpoint, {
              credentials: "include",
              cache: "no-store",
            });
            if (!response.ok) {
              if (response.status !== 401) {
                console.warn("[discover] recommendation API error", response.status);
              }
              return null;
            }
            const payload = (await response.json()) as RecommendationResponse;
            if (!Array.isArray(payload.recommendations)) return null;
            return payload.recommendations.map((entry) => entry.session);
          } catch (apiError) {
            console.warn("[discover] failed to fetch recommendations", apiError);
            return null;
          }
        };

        let recommendedEvents = await fetchRecommendationSessions();
        if (!recommendedEvents || recommendedEvents.length === 0) {
          recommendedEvents = selectFallbackRecommendations(typedUpcoming, userActivityTypes);
        }

        if (!cancelled) {
          setRecommendations((recommendedEvents ?? []).slice(0, RECOMMENDATION_SECTION_LIMIT));
        }

        if (userLocation) {
          const { data: nearbyData } = await supabase
            .from("sessions")
            .select(`
              id, created_by, price_cents, starts_at, ends_at, venue_id,
              activities(id,name,description,activity_types), venues(id,name,lat:lat,lng:lng)
            `)
            .gte("starts_at", new Date().toISOString())
            .not("venues.lat", "is", null)
            .not("venues.lng", "is", null)
            .order("starts_at", { ascending: true });

          if (nearbyData && !cancelled) {
            const typedNearby = nearbyData as Event[];
            const extractVenue = (v: Event["venues"]): VenueRef | null => {
              if (!v) return null;
              return Array.isArray(v) ? (v[0] || null) : v;
            };
            const nearbyFiltered = typedNearby
              .map((ev) => ({ ev, venue: extractVenue(ev.venues) }))
              .filter((item) => item.venue?.lat != null && item.venue?.lng != null)
              .map((item) => ({ ...item.ev, venue: item.venue as VenueRef }))
              .filter((ev) => {
                const venue = extractVenue(ev.venues);
                if (!venue?.lat || !venue.lng || !userLocation) return false;
                const distance = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  venue.lat,
                  venue.lng
                );
                return distance <= 25;
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
        if (!cancelled) {
          console.error("Error loading recommendations:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [userLocation, userLocation?.lat, userLocation?.lng]);

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

  const renderActivityCards = (events: Event[]) => {
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
          venue_id?: string | null;
          venues?: VenueRef | VenueRef[] | null;
        }>;
      }
    >();

    for (const event of events) {
      const activityRel = Array.isArray(event.activities) ? event.activities[0] : event.activities;
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
        venue_id: event.venue_id ?? null,
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
  };

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
            {renderActivityCards(recommendations)}
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
            {renderActivityCards(popularEvents)}
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
            {renderActivityCards(nearbyEvents)}
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
