import { expandCategoryAliases, osmCategoryTagMap, type NormalizedCategory } from '../categories';
import type { CityCategoryConfig } from '@dowhat/shared';
import { mergeCategories } from '../utils';
import type { PlacesQuery, ProviderFetchExplain, ProviderPlace } from '../types';

const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

const PLACEHOLDER_NAME_PATTERNS = [
  /^unnamed(?:\s+(?:place|spot|venue|location))?$/i,
  /^unknown(?:\s+(?:place|spot|venue|location))?$/i,
  /^no\s*name$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^null$/i,
];

const normalizeMeaningfulName = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_NAME_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  return trimmed;
};

const resolveOsmName = (tags: Record<string, string>): string | null => {
  return (
    normalizeMeaningfulName(tags.name)
    ?? normalizeMeaningfulName(tags['name:en'])
    ?? normalizeMeaningfulName(tags.int_name)
    ?? normalizeMeaningfulName(tags.official_name)
    ?? normalizeMeaningfulName(tags.short_name)
    ?? normalizeMeaningfulName(tags.brand)
    ?? normalizeMeaningfulName(tags.operator)
    ?? normalizeMeaningfulName(tags['addr:housename'])
  );
};

const describeAddress = (tags: Record<string, string> | undefined) => {
  if (!tags) return { address: undefined, locality: undefined, region: undefined, country: undefined, postcode: undefined };
  const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:neighbourhood'], tags['addr:suburb']]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    address: addressParts || tags['addr:place'] || tags['addr:full'] || undefined,
    locality: tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:municipality'],
    region: tags['addr:state'] || tags['addr:province'] || tags['is_in:state'],
    country: tags['addr:country'],
    postcode: tags['addr:postcode'] || tags['postal_code'] || tags['addr:postalcode'],
  };
};

const PILOT_OSM_TAGS: Record<string, Array<Array<{ key: string; value: string }>>> = {
  badminton: [[{ key: 'sport', value: 'badminton' }], [{ key: 'club', value: 'badminton' }]],
  chess: [[{ key: 'club', value: 'chess' }], [{ key: 'leisure', value: 'chess' }]],
  art_gallery: [[{ key: 'tourism', value: 'gallery' }], [{ key: 'amenity', value: 'arts_centre' }]],
  board_games: [[{ key: 'club', value: 'board_games' }], [{ key: 'leisure', value: 'board_games' }]],
  yoga: [[{ key: 'sport', value: 'yoga' }], [{ key: 'leisure', value: 'fitness_centre' }]],
  rock_climbing: [[{ key: 'sport', value: 'climbing' }], [{ key: 'leisure', value: 'climbing' }]],
  climbing_bouldering: [[{ key: 'sport', value: 'climbing' }], [{ key: 'leisure', value: 'sports_centre' }]],
  padel: [[{ key: 'sport', value: 'padel' }], [{ key: 'leisure', value: 'pitch' }, { key: 'sport', value: 'padel' }]],
  running_parks: [
    [{ key: 'leisure', value: 'track' }],
    [{ key: 'leisure', value: 'park' }, { key: 'sport', value: 'running' }],
  ],
  running: [[{ key: 'sport', value: 'running' }], [{ key: 'leisure', value: 'track' }]],
};

const buildFilterFragments = (categories: NormalizedCategory[]): string[] => {
  const fragments: string[] = [];
  // Required broad activity selectors for robust sports coverage.
  fragments.push(
    '  node({{bbox}})["leisure"="sports_centre"];\n'
      + '  way({{bbox}})["leisure"="sports_centre"];\n'
      + '  relation({{bbox}})["leisure"="sports_centre"];',
    '  node({{bbox}})["leisure"="pitch"];\n'
      + '  way({{bbox}})["leisure"="pitch"];\n'
      + '  relation({{bbox}})["leisure"="pitch"];',
    '  node({{bbox}})["leisure"="pitch"]["sport"];\n'
      + '  way({{bbox}})["leisure"="pitch"]["sport"];\n'
      + '  relation({{bbox}})["leisure"="pitch"]["sport"];',
    '  node({{bbox}})["leisure"="park"];\n'
      + '  way({{bbox}})["leisure"="park"];\n'
      + '  relation({{bbox}})["leisure"="park"];',
    '  node({{bbox}})["sport"="climbing"];\n'
      + '  way({{bbox}})["sport"="climbing"];\n'
      + '  relation({{bbox}})["sport"="climbing"];',
  );
  categories.forEach((category) => {
    const tagDefs = osmCategoryTagMap[category];
    if (!tagDefs) return;
    tagDefs.forEach(({ key, values }) => {
      values.forEach((value) => {
        const condition = `"${key}"="${value}"`;
        fragments.push(
          `  node({{bbox}})[${condition}];\n` +
            `  way({{bbox}})[${condition}];\n` +
            `  relation({{bbox}})[${condition}];`
        );
      });
    });
  });
  if (fragments.length === 0) {
    // fall back to broad activity/leisure selection
    fragments.push(
      '  node({{bbox}})["leisure"];\n  way({{bbox}})["leisure"];\n  relation({{bbox}})["leisure"];\n'
    );
  }
  return fragments;
};

const dedupeElements = (elements: OverpassElement[]): OverpassElement[] => {
  const seen = new Set<string>();
  const result: OverpassElement[] = [];
  elements.forEach((element) => {
    const key = `${element.type}:${element.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(element);
  });
  return result;
};

const categoriesFromTags = (tags: Record<string, string> | undefined): NormalizedCategory[] => {
  if (!tags) return [];
  const matched = new Set<NormalizedCategory>();
  (Object.keys(osmCategoryTagMap) as NormalizedCategory[]).forEach((category) => {
    const tagDefs = osmCategoryTagMap[category];
    tagDefs.forEach(({ key, values }) => {
      const tagValue = tags[key];
      if (tagValue && values.includes(tagValue)) {
        matched.add(category);
      }
    });
  });
  return Array.from(matched);
};

const inferTags = (tags: Record<string, string> | undefined): string[] => {
  if (!tags) return [];
  const interestingKeys = ['sport', 'cuisine', 'club', 'amenity', 'leisure', 'tourism'];
  const values = interestingKeys
    .map((key) => tags[key])
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/;|,/))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(values));
};

const buildPilotFragments = (categoryKeys: string[] | undefined): string[] => {
  if (!categoryKeys?.length) return [];
  const fragments: string[] = [];
  categoryKeys.forEach((key) => {
    const definitions = PILOT_OSM_TAGS[key];
    definitions?.forEach((definition) => {
      const filter = definition.map(({ key: tagKey, value }) => `["${tagKey}"="${value}"]`).join('');
      fragments.push(
        `  node({{bbox}})${filter};\n  way({{bbox}})${filter};\n  relation({{bbox}})${filter};`
      );
    });
  });
  return fragments;
};

export type OverpassParseSummary = {
  itemsFetched: number;
  itemsReturned: number;
  droppedUnnamed: number;
  droppedMissingCoordinate: number;
  dedupedElements: number;
};

const parseOverpassElements = (
  elements: OverpassElement[],
  options: { categories: NormalizedCategory[]; pilotCategories: string[] },
): { places: ProviderPlace[]; summary: OverpassParseSummary } => {
  const deduped = dedupeElements(elements);
  const places: ProviderPlace[] = [];
  const pilotKeys = new Set(options.pilotCategories);
  let droppedUnnamed = 0;
  let droppedMissingCoordinate = 0;

  deduped.forEach((element) => {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      droppedMissingCoordinate += 1;
      return;
    }
    const tags = element.tags ?? {};
    const name = resolveOsmName(tags);
    if (!name) {
      droppedUnnamed += 1;
      return;
    }
    const derivedCategories = categoriesFromTags(tags);
    const normalizedCategories = mergeCategories(options.categories, derivedCategories);
    const categoriesForPlace = normalizedCategories.length ? normalizedCategories : ['activity'];
    const { address, locality, region, country, postcode } = describeAddress(tags);
    const tagsList = inferTags(tags);
    pilotKeys.forEach((key) => {
      const definitions = PILOT_OSM_TAGS[key];
      const matchesPilot = definitions?.some((definition) =>
        definition.every(({ key: tagKey, value }) => tags[tagKey] === value),
      );
      if (matchesPilot) {
        tagsList.push(key);
      }
    });

    places.push({
      provider: 'openstreetmap',
      providerId: `${element.type}:${element.id}`,
      name,
      lat,
      lng,
      categories: categoriesForPlace,
      tags: tagsList,
      address: address || undefined,
      locality: locality || undefined,
      region: region || undefined,
      country: country || undefined,
      postcode: postcode || undefined,
      attribution: {
        text: '© OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL',
      },
      raw: tags,
      confidence: 0.6,
    });
  });

  return {
    places,
    summary: {
      itemsFetched: elements.length,
      itemsReturned: places.length,
      droppedUnnamed,
      droppedMissingCoordinate,
      dedupedElements: Math.max(0, elements.length - deduped.length),
    },
  };
};

export const fetchOverpassPlaces = async (
  query: PlacesQuery,
  options?: { categoryMap?: Map<string, CityCategoryConfig>; explain?: ProviderFetchExplain },
): Promise<ProviderPlace[]> => {
  const categories = expandCategoryAliases(query.categories ?? []);
  const bbox = `${query.bounds.sw.lat},${query.bounds.sw.lng},${query.bounds.ne.lat},${query.bounds.ne.lng}`;
  const pilotCategories = (query.categories ?? []).flatMap((key) => {
    const config = options?.categoryMap?.get(key);
    return config?.queryCategories?.length ? config.queryCategories : [key];
  });
  const pilotFragments = buildPilotFragments(pilotCategories);
  const defaultFragments = buildFilterFragments(categories);
  const filters = [...pilotFragments, ...defaultFragments].join('\n');

  const overpassQuery = `
[out:json][timeout:25];
(
${filters}
);
out center ${Math.min(query.limit ?? 200, 300)};
`.replace(/\{\{bbox\}\}/g, bbox);

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const parsed = parseOverpassElements(payload.elements ?? [], {
    categories,
    pilotCategories,
  });

  if (options?.explain) {
    options.explain.pagesFetched = response.ok ? 1 : 0;
    options.explain.nextPageTokensUsed = 0;
    options.explain.itemsFetched = parsed.summary.itemsFetched;
    options.explain.itemsReturned = parsed.summary.itemsReturned;
    options.explain.dropped = {
      ...(options.explain.dropped ?? {}),
      unnamed: parsed.summary.droppedUnnamed,
      missingCoordinate: parsed.summary.droppedMissingCoordinate,
      dedupedElements: parsed.summary.dedupedElements,
    };
  }

  return parsed.places;
};

export const __osmProviderTestUtils = {
  parseOverpassElements,
};
