export const NORMALIZED_CATEGORIES = [
  'activity',
  'arts_culture',
  'coffee',
  'community',
  'education',
  'event_space',
  'fitness',
  'food',
  'kids',
  'nightlife',
  'outdoors',
  'shopping',
  'spiritual',
  'wellness',
  'workspace',
] as const;

export type NormalizedCategory = typeof NORMALIZED_CATEGORIES[number];

const CATEGORY_ALIAS_MAP: Record<string, NormalizedCategory> = {
  activity: 'activity',
  activities: 'activity',
  arts: 'arts_culture',
  art: 'arts_culture',
  culture: 'arts_culture',
  coffee: 'coffee',
  cafe: 'coffee',
  cafes: 'coffee',
  community: 'community',
  social: 'community',
  education: 'education',
  school: 'education',
  schools: 'education',
  university: 'education',
  campus: 'education',
  event: 'event_space',
  events: 'event_space',
  venue: 'event_space',
  venues: 'event_space',
  fitness: 'fitness',
  gym: 'fitness',
  gyms: 'fitness',
  sport: 'fitness',
  sports: 'fitness',
  yoga: 'fitness',
  badminton: 'fitness',
  'board games': 'community',
  board_games: 'community',
  chess: 'community',
  running: 'outdoors',
  jogging: 'outdoors',
  track: 'outdoors',
  art_gallery: 'arts_culture',
  gallery: 'arts_culture',
  rock_climbing: 'fitness',
  climbing: 'fitness',
  bouldering: 'fitness',
  food: 'food',
  restaurant: 'food',
  restaurants: 'food',
  dining: 'food',
  eat: 'food',
  kids: 'kids',
  family: 'kids',
  nightlife: 'nightlife',
  bar: 'nightlife',
  bars: 'nightlife',
  club: 'nightlife',
  clubs: 'nightlife',
  entertainment: 'event_space',
  outdoors: 'outdoors',
  outdoor: 'outdoors',
  park: 'outdoors',
  parks: 'outdoors',
  camping: 'outdoors',
  hiking: 'outdoors',
  shopping: 'shopping',
  shop: 'shopping',
  shops: 'shopping',
  retail: 'shopping',
  market: 'shopping',
  markets: 'shopping',
  worship: 'spiritual',
  church: 'spiritual',
  temple: 'spiritual',
  mosque: 'spiritual',
  spiritual: 'spiritual',
  learning: 'education',
  wellness: 'wellness',
  salon: 'wellness',
  massage: 'wellness',
  workspace: 'workspace',
  cowork: 'workspace',
  coworking: 'workspace',
};

export const normalizeCategoryKey = (value: string): NormalizedCategory | null => {
  const lowered = value.trim().toLowerCase();
  if (!lowered) return null;
  if ((NORMALIZED_CATEGORIES as readonly string[]).includes(lowered)) {
    return lowered as NormalizedCategory;
  }
  return CATEGORY_ALIAS_MAP[lowered] ?? null;
};

export const normalizeCategories = (values: string[] | null | undefined): NormalizedCategory[] => {
  const set = new Set<NormalizedCategory>();
  (values ?? []).forEach((value) => {
    const normalized = normalizeCategoryKey(value);
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

export const expandCategoryAliases = (values: string[] | null | undefined): NormalizedCategory[] => {
  if (!values || values.length === 0) return [];

  const sanitized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!sanitized.length) return [];

  if (sanitized.some((value) => value === 'all' || value === '*' || value === 'any')) {
    return Array.from(NORMALIZED_CATEGORIES);
  }

  return normalizeCategories(sanitized);
};

export const osmCategoryTagMap: Record<NormalizedCategory, Array<{ key: string; values: string[] }>> = {
  activity: [
    { key: 'leisure', values: ['sports_centre', 'pitch', 'stadium'] },
    { key: 'amenity', values: ['community_centre', 'recreation_ground'] },
  ],
  arts_culture: [
    { key: 'amenity', values: ['theatre', 'arts_centre', 'cinema'] },
    { key: 'tourism', values: ['gallery', 'museum'] },
  ],
  coffee: [
    { key: 'amenity', values: ['cafe'] },
    { key: 'shop', values: ['coffee'] },
  ],
  community: [
    { key: 'amenity', values: ['community_centre', 'social_centre'] },
  ],
  education: [
    { key: 'amenity', values: ['school', 'kindergarten', 'college', 'university'] },
  ],
  event_space: [
    { key: 'amenity', values: ['conference_centre', 'events_venue', 'exhibition_centre'] },
  ],
  fitness: [
    { key: 'leisure', values: ['fitness_centre', 'sports_centre', 'swimming_pool'] },
    { key: 'amenity', values: ['gym'] },
  ],
  food: [
    { key: 'amenity', values: ['restaurant', 'fast_food', 'food_court'] },
    { key: 'shop', values: ['supermarket', 'bakery'] },
  ],
  kids: [
    { key: 'leisure', values: ['playground'] },
    { key: 'amenity', values: ['childcare'] },
  ],
  nightlife: [
    { key: 'amenity', values: ['bar', 'pub', 'nightclub'] },
  ],
  outdoors: [
    { key: 'leisure', values: ['park', 'nature_reserve'] },
    { key: 'natural', values: ['wood', 'beach'] },
  ],
  shopping: [
    { key: 'shop', values: ['mall', 'department_store', 'general', 'convenience'] },
    { key: 'amenity', values: ['marketplace'] },
  ],
  spiritual: [
    { key: 'amenity', values: ['place_of_worship', 'church', 'temple', 'mosque'] },
  ],
  wellness: [
    { key: 'amenity', values: ['spa', 'clinic'] },
    { key: 'shop', values: ['beauty', 'massage'] },
  ],
  workspace: [
    { key: 'office', values: ['coworking'] },
    { key: 'amenity', values: ['coworking_space'] },
  ],
};

export const foursquareCategoryMap: Record<NormalizedCategory, string[]> = {
  activity: ['18000', '19000'],
  arts_culture: ['10000'],
  coffee: ['13032'],
  community: ['12000'],
  education: ['12000', '13038'],
  event_space: ['12004', '12009'],
  fitness: ['18000'],
  food: ['13065'],
  kids: ['10046', '12065'],
  nightlife: ['10032'],
  outdoors: ['16000'],
  shopping: ['17000'],
  spiritual: ['12039'],
  wellness: ['14000'],
  workspace: ['12026', '12054'],
};

export const googleTypeMap: Record<NormalizedCategory, string[]> = {
  activity: ['point_of_interest'],
  arts_culture: ['art_gallery', 'museum'],
  coffee: ['cafe'],
  community: ['community_center'],
  education: ['school', 'university'],
  event_space: ['tourist_attraction'],
  fitness: ['gym'],
  food: ['restaurant'],
  kids: ['park', 'school'],
  nightlife: ['bar'],
  outdoors: ['park'],
  shopping: ['shopping_mall', 'store'],
  spiritual: ['place_of_worship'],
  wellness: ['spa'],
  workspace: ['real_estate_agency'],
};
