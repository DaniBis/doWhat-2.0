import type { SupabaseClient } from '@supabase/supabase-js';

import { haversineMeters } from '@/lib/places/utils';
import { resolvePlaceFromCoordsWithClient } from '@/lib/places/resolver';

import type { EventSourceRow, NormalizedEvent, VenueMatchResult } from './types';
import { cleanString, computeGeoHash } from './utils';

const GEO_DELTA = 0.002; // ~220m at the equator
const MAX_DISTANCE_METERS = 200;
const NAME_MATCH_DISTANCE_METERS = 500;

interface PlaceRecord {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  locality: string | null;
  categories: string[] | null;
}

type ServiceClient = SupabaseClient;

const fetchNearbyPlaces = async (
  client: ServiceClient,
  lat: number,
  lng: number,
): Promise<PlaceRecord[]> => {
  const { data, error } = await client
    .from('places')
    .select('id,name,lat,lng,address,locality,categories')
    .gte('lat', lat - GEO_DELTA)
    .lte('lat', lat + GEO_DELTA)
    .gte('lng', lng - GEO_DELTA)
    .lte('lng', lng + GEO_DELTA)
    .limit(25);
  if (error) {
    console.warn('Failed to fetch nearby places', error);
    return [];
  }
  return (data as PlaceRecord[] | null) ?? [];
};

const fetchPlacesByName = async (
  client: ServiceClient,
  name: string,
  city: string | null,
): Promise<PlaceRecord[]> => {
  const term = cleanString(name).slice(0, 80);
  if (!term) return [];
  let query = client
    .from('places')
    .select('id,name,lat,lng,address,locality,categories')
    .ilike('name', `%${term}%`)
    .limit(25);
  if (city) {
    query = query.eq('locality', city);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('Failed to fuzzy match place', name, error);
    return [];
  }
  return (data as PlaceRecord[] | null) ?? [];
};

export const matchVenueForEvent = async (
  client: ServiceClient,
  event: NormalizedEvent,
  source: EventSourceRow,
): Promise<VenueMatchResult> => {
  if (event.lat != null && event.lng != null) {
    const candidates = await fetchNearbyPlaces(client, event.lat, event.lng);
    const ranked = candidates
      .map((place) => ({
        place,
        distance: haversineMeters(place.lat ?? 0, place.lng ?? 0, event.lat!, event.lng!),
      }))
      .sort((a, b) => a.distance - b.distance);
    const best = ranked.find((entry) => entry.distance <= MAX_DISTANCE_METERS);
    if (best) {
      return {
        placeId: best.place.id,
        venueName: best.place.name,
        lat: best.place.lat,
        lng: best.place.lng,
        address: best.place.address,
        geohash7: computeGeoHash(best.place.lat, best.place.lng),
      };
    }
  }

  if (event.venueName) {
    const candidates = await fetchPlacesByName(client, event.venueName, source.city);
    const ranked = candidates
      .map((place) => ({
        place,
        distance: place.lat != null && place.lng != null && event.lat != null && event.lng != null
          ? haversineMeters(place.lat, place.lng, event.lat, event.lng)
          : NAME_MATCH_DISTANCE_METERS,
      }))
      .sort((a, b) => a.distance - b.distance);
    const best = ranked[0];
    if (best && best.distance <= NAME_MATCH_DISTANCE_METERS) {
      return {
        placeId: best.place.id,
        venueName: best.place.name,
        lat: best.place.lat,
        lng: best.place.lng,
        address: best.place.address,
        geohash7: computeGeoHash(best.place.lat, best.place.lng),
      };
    }
  }

  if (event.lat != null && event.lng != null) {
    try {
      const resolved = await resolvePlaceFromCoordsWithClient(client, {
        lat: event.lat,
        lng: event.lng,
        labelHint: event.venueName ?? source.venue_hint ?? event.title,
        source: 'event-ingest',
      });
      const resolvedLat = resolved.place.lat ?? event.lat;
      const resolvedLng = resolved.place.lng ?? event.lng;
      return {
        placeId: resolved.placeId,
        venueName: resolved.label,
        lat: resolvedLat,
        lng: resolvedLng,
        address: resolved.place.address ?? event.address ?? null,
        geohash7: computeGeoHash(resolvedLat, resolvedLng),
      };
    } catch (error) {
      console.warn('Failed to resolve place for event', event.title, error);
    }
  }

  return {
    placeId: null,
    venueName: event.venueName ?? source.venue_hint ?? null,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    address: event.address ?? null,
    geohash7: computeGeoHash(event.lat ?? null, event.lng ?? null),
  };
};

export const enrichEventsWithVenue = async (
  client: ServiceClient,
  events: NormalizedEvent[],
  source: EventSourceRow,
): Promise<VenueMatchResult[]> => Promise.all(events.map((event) => matchVenueForEvent(client, event, source)));
