import { fetchOverpassPlaceSummaries } from '@dowhat/shared';
import { createWebUrl } from './web';

export interface PlaceSuggestion {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  categories: string[];
}

export interface FetchNearbyPlacesOptions {
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
  signal?: AbortSignal;
}

const fetchFromBackend = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> => {
  const url = createWebUrl('/api/places');
  const delta = Math.max(radiusMeters, 100) / 111_000;
  const sw = [lat - delta, lng - delta];
  const ne = [lat + delta, lng + delta];
  url.searchParams.set('sw', `${sw[0].toFixed(6)},${sw[1].toFixed(6)}`);
  url.searchParams.set('ne', `${ne[0].toFixed(6)},${ne[1].toFixed(6)}`);
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 20))));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Places search failed (${response.status})`);
  }

  const data = (await response.json()) as {
    places?: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      address?: string | null;
      categories?: string[];
    }>;
  };

  return (data.places ?? [])
    .filter((place): place is Required<Pick<typeof place, 'id' | 'name' | 'lat' | 'lng'>> & typeof place => {
      return Boolean(place?.id && place?.name && Number.isFinite(place?.lat) && Number.isFinite(place?.lng));
    })
    .map((place) => ({
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      address: place.address ?? null,
      categories: Array.isArray(place.categories) ? place.categories : [],
    }))
    .slice(0, limit);
};

export async function fetchNearbyPlaces(options: FetchNearbyPlacesOptions): Promise<PlaceSuggestion[]> {
  const { lat, lng, radiusMeters = 5000, limit = 5, signal } = options;

  try {
    return await fetchFromBackend(lat, lng, radiusMeters, limit, signal);
  } catch (primaryError) {
    if (__DEV__) {
      console.info('[placesSearch] Primary /api/places request failed, trying Overpass fallback', primaryError);
    }
    try {
      const fallbackSummaries = await fetchOverpassPlaceSummaries({
        lat,
        lng,
        radiusMeters,
        limit,
        signal,
      });
      if (fallbackSummaries.length > 0) {
        return fallbackSummaries
          .map((place): PlaceSuggestion => ({
            id: place.id,
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            address: place.address ?? null,
            categories: Array.isArray(place.categories) ? place.categories : [],
          }))
          .slice(0, limit);
      }
    } catch (fallbackError) {
      if (__DEV__) {
        console.info('[placesSearch] Overpass fallback failed', fallbackError);
      }
      throw fallbackError instanceof Error ? fallbackError : new Error('Nearby places unavailable.');
    }

    if (primaryError instanceof Error) {
      throw primaryError;
    }
    throw new Error('Nearby places unavailable.');
  }
}
