import { expandCategoryAliases, googleTypeMap, normalizeCategories } from '../categories';
import type { PlacesQuery, ProviderPlace } from '../types';
import { mergeCategories } from '../utils';

const GOOGLE_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

interface GoogleGeometry {
  location: { lat: number; lng: number };
}

interface GoogleResult {
  place_id: string;
  name: string;
  geometry: GoogleGeometry;
  types?: string[];
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  business_status?: string;
  permanently_closed?: boolean;
}

export const fetchGooglePlaces = async (query: PlacesQuery): Promise<ProviderPlace[]> => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const categories = expandCategoryAliases(query.categories);
  const types = Array.from(new Set(categories.flatMap((category) => googleTypeMap[category] ?? [])));
  if (types.length === 0) types.push('point_of_interest');

  const centerLat = (query.bounds.sw.lat + query.bounds.ne.lat) / 2;
  const centerLng = (query.bounds.sw.lng + query.bounds.ne.lng) / 2;

  const diagonalLat = Math.abs(query.bounds.ne.lat - query.bounds.sw.lat);
  const diagonalLng = Math.abs(query.bounds.ne.lng - query.bounds.sw.lng);
  const approxRadiusMeters = Math.min(5000, Math.max(200, ((diagonalLat + diagonalLng) / 2) * 111_000));

  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('location', `${centerLat.toFixed(6)},${centerLng.toFixed(6)}`);
  url.searchParams.set('radius', String(Math.round(approxRadiusMeters)));
  url.searchParams.set('type', types[0]);
  if (types.length > 1) {
    url.searchParams.set('keyword', types.slice(1).join(' '));
  }

  const response = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status})`);
  }

  const payload = (await response.json()) as { results?: GoogleResult[] };
  const results = payload.results ?? [];

  return results
    .filter((result) => !result.permanently_closed && result.business_status !== 'CLOSED_TEMPORARILY')
    .map<ProviderPlace>((result) => {
      const normalizedCategories = mergeCategories(
        categories,
        normalizeCategories(result.types ?? []),
      );
      const categoriesForPlace = normalizedCategories.length ? normalizedCategories : ['activity'];
      const location = result.geometry?.location;
      return {
        provider: 'google_places',
        providerId: result.place_id,
        name: result.name,
        lat: location?.lat ?? 0,
        lng: location?.lng ?? 0,
        categories: categoriesForPlace,
        address: result.vicinity,
        rating: result.rating,
        ratingCount: result.user_ratings_total,
        priceLevel: typeof result.price_level === 'number' ? result.price_level : undefined,
        attribution: {
          text: 'Google Places',
          url: 'https://developers.google.com/maps/documentation/places/web-service/policies',
        },
        raw: result as unknown as Record<string, unknown>,
        confidence: 0.7,
        canPersist: false,
      };
    })
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
};
