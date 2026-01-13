import { expandCategoryAliases, googleTypeMap, normalizeCategories } from '../categories';
import type { PlacesQuery, ProviderPlace } from '../types';
import { mergeCategories } from '../utils';

const GOOGLE_NEARBY_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const GOOGLE_TEXT_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_MAX_RESULTS = 60;
const GOOGLE_MAX_PAGES = 3;
const GOOGLE_PAGINATION_DELAY_MS = 1200;
const GOOGLE_DEBUG_ENABLED = process.env.DEBUG_GOOGLE_PLACES === '1';

const CLIMBING_TEXT_QUERIES = [
  'bouldering gym',
  'climbing gym',
  'bouldering',
  'climbing',
  'escalada',
  'sala escalada',
];

const CLIMBING_CATEGORY_HINTS = ['climb', 'boulder', 'bouldering', 'escalada'];

type GoogleGeometry = { location?: { lat?: number | null; lng?: number | null } | null };

interface GoogleResult {
  place_id: string;
  name: string;
  geometry?: GoogleGeometry;
  types?: string[];
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  business_status?: string;
  permanently_closed?: boolean;
}

type GooglePayload = {
  results?: GoogleResult[];
  next_page_token?: string;
};

type GoogleStrategy =
  | { mode: 'nearby'; type?: string | null; keyword?: string | null }
  | { mode: 'text'; query: string };

const waitForNextPage = async () => {
  if (process.env.NODE_ENV === 'test') return;
  await new Promise((resolve) => setTimeout(resolve, GOOGLE_PAGINATION_DELAY_MS));
};

const shouldRunTextSearch = (categories: string[]) => {
  const lower = categories.map((value) => value.toLowerCase());
  return lower.some((category) => CLIMBING_CATEGORY_HINTS.some((hint) => category.includes(hint)));
};

const buildStrategies = (types: string[], keywords: string[], includeTextSearch: boolean): GoogleStrategy[] => {
  const trimmedKeywords = keywords.map((value) => value.trim()).filter((value) => value.length > 0);
  const keywordPhrase = trimmedKeywords.slice(0, 6).join(' ');
  const strategies: GoogleStrategy[] = [];
  const typeQueue = types.length ? types : ['point_of_interest'];

  typeQueue.slice(0, 4).forEach((type, index) => {
    strategies.push({
      mode: 'nearby',
      type,
      keyword: index === 0 && keywordPhrase ? keywordPhrase : null,
    });
  });

  if (keywordPhrase) {
    strategies.push({ mode: 'nearby', type: null, keyword: keywordPhrase });
  }

  if (!strategies.length) {
    strategies.push({ mode: 'nearby', type: 'point_of_interest', keyword: keywordPhrase || null });
  }

  if (includeTextSearch) {
    const climbingQueries = Array.from(
      new Set([
        ...CLIMBING_TEXT_QUERIES,
        ...trimmedKeywords.filter((value) => CLIMBING_CATEGORY_HINTS.some((hint) => value.toLowerCase().includes(hint))),
      ]),
    ).slice(0, 6);
    climbingQueries.forEach((query) => {
      strategies.push({ mode: 'text', query });
    });
  }

  return strategies;
};

const buildBaseParams = (apiKey: string, centerLat: number, centerLng: number, radius: number) => {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  params.set('location', `${centerLat.toFixed(6)},${centerLng.toFixed(6)}`);
  params.set('radius', String(Math.round(radius)));
  params.set('language', 'en');
  return params;
};

const buildNextPageParams = (apiKey: string, token: string) => {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  params.set('pagetoken', token);
  return params;
};

const buildTextSearchParams = (
  apiKey: string,
  query: string,
  centerLat: number,
  centerLng: number,
  radius: number,
) => {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  params.set('query', query);
  params.set('location', `${centerLat.toFixed(6)},${centerLng.toFixed(6)}`);
  params.set('radius', String(Math.round(radius)));
  params.set('language', 'en');
  return params;
};

const fetchPlacesPayload = async (endpoint: string, params: URLSearchParams): Promise<GooglePayload> => {
  const url = new URL(endpoint);
  url.search = params.toString();
  const response = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Google Places request failed (${response.status}): ${errorText}`);
  }
  return (await response.json()) as GooglePayload;
};

const describeStrategy = (strategy: GoogleStrategy) => {
  if (strategy.mode === 'text') {
    return `text:${strategy.query}`;
  }
  const type = strategy.type ?? 'keyword-only';
  return `nearby:${type}${strategy.keyword ? `+${strategy.keyword}` : ''}`;
};

export const fetchGooglePlaces = async (query: PlacesQuery): Promise<ProviderPlace[]> => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const rawCategoryHints = (query.categories ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const categories = expandCategoryAliases(query.categories);
  const types = Array.from(new Set(categories.flatMap((category) => googleTypeMap[category] ?? [])));
  if (!types.length) types.push('point_of_interest');

  const centerLat = (query.bounds.sw.lat + query.bounds.ne.lat) / 2;
  const centerLng = (query.bounds.sw.lng + query.bounds.ne.lng) / 2;
  const diagonalLat = Math.abs(query.bounds.ne.lat - query.bounds.sw.lat);
  const diagonalLng = Math.abs(query.bounds.ne.lng - query.bounds.sw.lng);
  const approxRadiusMeters = Math.min(5000, Math.max(200, ((diagonalLat + diagonalLng) / 2) * 111_000));

  const keywordTokens = (rawCategoryHints.length ? rawCategoryHints : categories)
    .map((category) => category.replace(/[_-]/g, ' '));
  const strategies = buildStrategies(
    types,
    keywordTokens,
    shouldRunTextSearch([...categories, ...rawCategoryHints]),
  );
  const maxResults = Math.min(Math.max(query.limit ?? 30, 20), GOOGLE_MAX_RESULTS);
  const baseParams = buildBaseParams(apiKey, centerLat, centerLng, approxRadiusMeters);

  const seen = new Set<string>();
  const aggregated: GoogleResult[] = [];
  const strategySummaries: Array<{ label: string; endpoint: string; fetched: number }> = [];

  const appendResults = (items: GoogleResult[]) => {
    items.forEach((item) => {
      if (!item.place_id || seen.has(item.place_id)) return;
      seen.add(item.place_id);
      aggregated.push(item);
    });
  };

  for (const strategy of strategies) {
    if (aggregated.length >= maxResults) break;
    let nextToken: string | null = null;
    let fetchedForStrategy = 0;
    const endpoint = strategy.mode === 'text' ? GOOGLE_TEXT_ENDPOINT : GOOGLE_NEARBY_ENDPOINT;

    for (let page = 0; page < GOOGLE_MAX_PAGES; page += 1) {
      if (aggregated.length >= maxResults) break;
      let params: URLSearchParams;
      if (nextToken) {
        params = buildNextPageParams(apiKey, nextToken);
      } else if (strategy.mode === 'text') {
        params = buildTextSearchParams(apiKey, strategy.query, centerLat, centerLng, approxRadiusMeters);
      } else {
        params = new URLSearchParams(baseParams);
        if (strategy.type) params.set('type', strategy.type);
        if (strategy.keyword) params.set('keyword', strategy.keyword);
      }

      const payload = await fetchPlacesPayload(endpoint, params);
      const results = (payload.results ?? []).filter(
        (result) => !result.permanently_closed && result.business_status !== 'CLOSED_TEMPORARILY',
      );
      fetchedForStrategy += results.length;
      appendResults(results);

      if (!payload.next_page_token) {
        break;
      }

      nextToken = payload.next_page_token;
      await waitForNextPage();
    }

    strategySummaries.push({ label: describeStrategy(strategy), endpoint, fetched: fetchedForStrategy });
  }

  const limited = aggregated.slice(0, maxResults);

  if (GOOGLE_DEBUG_ENABLED) {
    const naturalHigh = aggregated.find((result) => result.name?.toLowerCase().includes('natural high'));
    // eslint-disable-next-line no-console
    console.info('[google-places] strategy summary', {
      bounds: query.bounds,
      limit: maxResults,
      aggregated: aggregated.length,
      strategies: strategySummaries,
      naturalHigh: naturalHigh ? { name: naturalHigh.name, placeId: naturalHigh.place_id } : null,
    });
  }

  return limited
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
