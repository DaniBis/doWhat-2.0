import { expandCategoryAliases, foursquareCategoryMap, normalizeCategoryKey, type NormalizedCategory } from '../categories';
import type { CityCategoryConfig } from '@dowhat/shared';
import { haversineMeters, mergeCategories } from '../utils';
import type { PlacesQuery, ProviderPlace } from '../types';

const FOURSQUARE_ENDPOINT = 'https://api.foursquare.com/v3/places/search';

const selectCategories = (source: string[] | NormalizedCategory[] | undefined): NormalizedCategory[] =>
  expandCategoryAliases((source ?? []) as string[]);

const categoriesToFoursquare = (categories: NormalizedCategory[]): string[] => {
  const ids = new Set<string>();
  categories.forEach((category) => {
    const mapped = foursquareCategoryMap[category];
    mapped?.forEach((id) => ids.add(id));
  });
  return Array.from(ids);
};

const buildKeywordFilters = (
  selected: string[] | undefined,
  categoryMap?: Map<string, CityCategoryConfig>,
): string[] => {
  if (!selected?.length || !categoryMap) return [];
  const keywords = new Set<string>();
  selected.forEach((key) => {
    const config = categoryMap.get(key);
    config?.tagFilters?.forEach((tag) => keywords.add(tag.replace(/_/g, ' ')));
  });
  return Array.from(keywords);
};

interface FoursquareCategory {
  id: number | string;
  name: string;
}

interface FoursquareGeocodes {
  main: { latitude: number; longitude: number };
}

interface FoursquareLocation {
  address?: string;
  locality?: string;
  region?: string;
  country?: string;
  postcode?: string;
}

interface FoursquareResult {
  fsq_id: string;
  name: string;
  categories: FoursquareCategory[];
  geocodes: FoursquareGeocodes;
  location: FoursquareLocation;
  distance?: number;
  link?: string;
  website?: string;
  rating?: number;
  popularity?: number;
  tel?: string;
}

const interpretCategories = (categories: FoursquareCategory[]): NormalizedCategory[] => {
  const set = new Set<NormalizedCategory>();
  categories.forEach((category) => {
    const normalized = normalizeCategoryKey(category.name);
    if (normalized) set.add(normalized);
    // Fallback using mapping by ID if alias not matched
    (Object.entries(foursquareCategoryMap) as Array<[NormalizedCategory, string[]]>).forEach(([key, ids]) => {
      if (ids.includes(String(category.id))) {
        set.add(key as NormalizedCategory);
      }
    });
  });
  return Array.from(set);
};

export const fetchFoursquarePlaces = async (
  query: PlacesQuery,
  options?: { categoryMap?: Map<string, CityCategoryConfig> },
): Promise<ProviderPlace[]> => {
  const apiKey = process.env.FOURSQUARE_API_KEY;
  if (!apiKey) return [];

  const categories = selectCategories(query.categories);
  const categoryIds = categoriesToFoursquare(categories);
  const keywordFilters = buildKeywordFilters(query.categories, options?.categoryMap);

  const centerLat = (query.bounds.sw.lat + query.bounds.ne.lat) / 2;
  const centerLng = (query.bounds.sw.lng + query.bounds.ne.lng) / 2;
  const radiusMeters = Math.min(
    5000,
    Math.max(
      200,
      haversineMeters(query.bounds.sw.lat, query.bounds.sw.lng, query.bounds.ne.lat, query.bounds.ne.lng) / 2,
    ),
  );

  const url = new URL(FOURSQUARE_ENDPOINT);
  url.searchParams.set('ll', `${centerLat.toFixed(6)},${centerLng.toFixed(6)}`);
  url.searchParams.set('radius', String(Math.round(radiusMeters)));
  url.searchParams.set('limit', String(Math.min(query.limit ?? 50, 50)));
  url.searchParams.set('sort', 'DISTANCE');
  if (categoryIds.length > 0) {
    url.searchParams.set('categories', categoryIds.join(','));
  }
  if (keywordFilters.length && !url.searchParams.has('query')) {
    url.searchParams.set('query', keywordFilters.join(' '));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: apiKey,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Foursquare request failed (${response.status})`);
  }

  const payload = (await response.json()) as { results?: FoursquareResult[] };
  const results = payload.results ?? [];

  return results.map<ProviderPlace>((result) => {
    const geocodes = result.geocodes?.main;
    const mergedCategories = mergeCategories(categories, interpretCategories(result.categories));
    const categoriesForPlace = mergedCategories.length ? mergedCategories : ['activity'];
    const tagSet = new Set(result.categories.map((category) => category.name.toLowerCase()));
    keywordFilters.forEach((keyword) => tagSet.add(keyword.toLowerCase()));

    return {
      provider: 'foursquare',
      providerId: result.fsq_id,
      name: result.name,
      lat: geocodes?.latitude ?? 0,
      lng: geocodes?.longitude ?? 0,
      categories: categoriesForPlace,
      tags: Array.from(tagSet),
      address: result.location.address,
      locality: result.location.locality,
      region: result.location.region,
      country: result.location.country,
      postcode: result.location.postcode,
      website: result.website,
      phone: result.tel,
      rating: typeof result.rating === 'number' ? result.rating : undefined,
      raw: result as unknown as Record<string, unknown>,
      attribution: {
        text: 'Data from Foursquare Places',
        url: result.link || 'https://location.foursquare.com/developer/places-api',
      },
      confidence: 0.8,
    };
  }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
};
