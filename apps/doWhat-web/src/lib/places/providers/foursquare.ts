import { expandCategoryAliases, foursquareCategoryMap, normalizeCategoryKey, type NormalizedCategory } from '../categories';
import type { CityCategoryConfig, FoursquareCategory, FoursquarePlace, FoursquareSearchResponse } from '@dowhat/shared';
import { haversineMeters, mergeCategories } from '../utils';
import type { PlacesQuery, ProviderPlace } from '../types';

const FOURSQUARE_ENDPOINT = 'https://places-api.foursquare.com/places/search';
const FOURSQUARE_API_VERSION = '2025-06-17';

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
    url.searchParams.set('fsq_category_ids', categoryIds.join(','));
  }
  if (keywordFilters.length && !url.searchParams.has('query')) {
    url.searchParams.set('query', keywordFilters.join(' '));
  }
  url.searchParams.set('fields', 'fsq_place_id,name,latitude,longitude,location,categories,link');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Places-Api-Version': FOURSQUARE_API_VERSION,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Foursquare request failed (${response.status})`);
  }

  const payload = (await response.json()) as FoursquareSearchResponse & {
    results?: Array<Record<string, unknown>>;
  };
  const results = payload.results ?? [];

  return results.map<ProviderPlace>((rawResult) => {
    const result = rawResult as FoursquarePlace & Record<string, unknown>;
    const latitude =
      (typeof result.latitude === 'number' ? result.latitude : null)
      ?? (typeof result.geocodes?.main?.latitude === 'number' ? result.geocodes.main.latitude : null)
      ?? null;
    const longitude =
      (typeof result.longitude === 'number' ? result.longitude : null)
      ?? (typeof result.geocodes?.main?.longitude === 'number' ? result.geocodes.main.longitude : null)
      ?? null;

    const resultCategories = (result.categories ?? []) as Array<FoursquareCategory & { fsq_category_id?: string }>;
    const mergedCategories = mergeCategories(categories, interpretCategories(resultCategories));
    const categoriesForPlace = mergedCategories.length ? mergedCategories : ['activity'];
    const tagSet = new Set(resultCategories.map((category) => category.name.toLowerCase()));
    keywordFilters.forEach((keyword) => tagSet.add(keyword.toLowerCase()));

    return {
      provider: 'foursquare',
      providerId: String(result.fsq_place_id ?? result.fsq_id ?? ''),
      name: result.name,
      lat: latitude ?? 0,
      lng: longitude ?? 0,
      categories: categoriesForPlace,
      tags: Array.from(tagSet),
      address: result.location?.address,
      locality: result.location?.locality,
      region: result.location?.region,
      country: result.location?.country,
      postcode: result.location?.postcode,
      website: typeof result.website === 'string' ? result.website : undefined,
      phone: typeof result.tel === 'string' ? result.tel : undefined,
      description: typeof result.description === 'string' ? result.description : undefined,
      rating: typeof result.rating === 'number' ? result.rating : undefined,
      raw: result as unknown as Record<string, unknown>,
      attribution: {
        text: 'Data from Foursquare Places',
        url: result.link || 'https://location.foursquare.com/developer/places-api',
      },
      confidence: 0.8,
    };
  }).filter((place) => place.providerId.length > 0 && Number.isFinite(place.lat) && Number.isFinite(place.lng));
};
