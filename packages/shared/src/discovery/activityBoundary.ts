export type ActivityFirstDiscoveryInput = {
  name?: string | null;
  description?: string | null;
  categories?: readonly (string | null | undefined)[] | null;
  tags?: readonly (string | null | undefined)[] | null;
  activityTypes?: readonly (string | null | undefined)[] | null;
  taxonomyCategories?: readonly (string | null | undefined)[] | null;
  verifiedActivities?: readonly (string | null | undefined)[] | null;
  hasVenueActivityMapping?: boolean | null;
  hasManualOverride?: boolean | null;
  hasEventOrSessionEvidence?: boolean | null;
};

export type ActivityFirstDiscoveryPolicyResult = {
  isEligible: boolean;
  isHospitalityPrimary: boolean;
  hasHospitalitySignals: boolean;
  hasActivityCategoryEvidence: boolean;
  hasStructuredActivityEvidence: boolean;
  hasVenueActivityMapping: boolean;
  hasManualOverride: boolean;
  hasEventOrSessionEvidence: boolean;
  evidenceSignals: string[];
};

export const HOSPITALITY_FIRST_DISCOVERY_FILTER_VALUES = [
  'bar',
  'bars',
  'cafe',
  'cafes',
  'coffee',
  'cocktail',
  'cocktails',
  'dining',
  'discover_taste',
  'drink',
  'drinks',
  'food',
  'food_drink_trails',
  'natural_wine_tastings',
  'night_club',
  'nightclub',
  'nightlife',
  'pub',
  'pubs',
  'restaurant',
  'restaurants',
  'specialty_coffee_crawls',
  'street_food_hunts',
  'supper_club_tables',
  'wine',
] as const;

export const ACTIVITY_FIRST_DISCOVERY_EVIDENCE_PRIORITY = [
  'manual_override',
  'real_events_or_sessions',
  'confirmed_venue_activity_mapping',
  'structured_activity_signal',
  'activity_supporting_category',
] as const;

const HOSPITALITY_STEMS = [
  'bar',
  'beer',
  'bistro',
  'brew',
  'brunch',
  'cafe',
  'coffee',
  'cocktail',
  'dining',
  'drink',
  'food',
  'nightlife',
  'nightclub',
  'pub',
  'restaurant',
  'roaster',
  'tasting',
  'wine',
] as const;

const ACTIVITY_CATEGORY_EXACT = new Set([
  'activity',
  'arts_culture',
  'community',
  'education',
  'event_space',
  'fitness',
  'kids',
  'outdoors',
  'spiritual',
  'wellness',
  'workspace',
]);

const ACTIVITY_STEMS = [
  'art',
  'badminton',
  'board',
  'board_game',
  'boulder',
  'bouldering',
  'box',
  'boxing',
  'breath',
  'ceramic',
  'chess',
  'climb',
  'climbing',
  'coding',
  'community',
  'craft',
  'creative',
  'cycle',
  'cycling',
  'dance',
  'dojo',
  'esport',
  'exchange',
  'fitness',
  'game',
  'garden',
  'gym',
  'hack',
  'hike',
  'jam',
  'journal',
  'language',
  'learn',
  'maker',
  'makerspace',
  'martial',
  'meditation',
  'meetup',
  'meetups',
  'mobility',
  'music',
  'outdoor',
  'padel',
  'paint',
  'painting',
  'photography',
  'pilates',
  'run',
  'running',
  'session',
  'skate',
  'sketch',
  'sport',
  'study',
  'surf',
  'swim',
  'tabletop',
  'tennis',
  'theater',
  'theatre',
  'trail',
  'trivia',
  'volunteer',
  'wellness',
  'workshop',
  'yoga',
] as const;

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

const toTokenSet = (values?: readonly (string | null | undefined)[] | null): Set<string> => {
  const set = new Set<string>();
  (values ?? []).forEach((value) => {
    if (typeof value !== 'string') return;
    const normalized = normalizeToken(value);
    if (normalized) set.add(normalized);
  });
  return set;
};

const tokenIncludesStem = (token: string, stems: readonly string[]): boolean =>
  stems.some((stem) => token === stem || token.startsWith(`${stem}_`) || token.endsWith(`_${stem}`));

const tokenLooksActivityOriented = (token: string): boolean => {
  if (!token) return false;
  if (ACTIVITY_CATEGORY_EXACT.has(token)) return true;
  return tokenIncludesStem(token, ACTIVITY_STEMS);
};

const tokenLooksHospitalityFirst = (token: string): boolean => {
  if (!token) return false;
  if ((HOSPITALITY_FIRST_DISCOVERY_FILTER_VALUES as readonly string[]).includes(token)) return true;
  return tokenIncludesStem(token, HOSPITALITY_STEMS);
};

export const isHospitalityFirstDiscoveryValue = (value: string): boolean =>
  tokenLooksHospitalityFirst(normalizeToken(value));

export const stripHospitalityFirstDiscoverySelections = (
  values?: readonly (string | null | undefined)[] | null,
): string[] => {
  if (!values?.length) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? normalizeToken(value) : ''))
        .filter(Boolean)
        .filter((value) => !tokenLooksHospitalityFirst(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
};

export const evaluateActivityFirstDiscoveryPolicy = (
  input: ActivityFirstDiscoveryInput,
): ActivityFirstDiscoveryPolicyResult => {
  const categoryTokens = toTokenSet([...(input.categories ?? []), ...(input.tags ?? [])]);
  const structuredTokens = toTokenSet([
    ...(input.activityTypes ?? []),
    ...(input.taxonomyCategories ?? []),
    ...(input.verifiedActivities ?? []),
  ]);

  const hasHospitalitySignals =
    Array.from(categoryTokens).some((token) => tokenLooksHospitalityFirst(token))
    || Array.from(structuredTokens).some((token) => tokenLooksHospitalityFirst(token));
  const hasActivityCategoryEvidence = Array.from(categoryTokens).some((token) => tokenLooksActivityOriented(token));
  const hasStructuredActivityEvidence = Array.from(structuredTokens).some((token) => tokenLooksActivityOriented(token));
  const hasVenueActivityMapping = Boolean(input.hasVenueActivityMapping);
  const hasManualOverride = Boolean(input.hasManualOverride);
  const hasEventOrSessionEvidence = Boolean(input.hasEventOrSessionEvidence);
  const isHospitalityPrimary = hasHospitalitySignals && !hasActivityCategoryEvidence;

  const evidenceSignals = ACTIVITY_FIRST_DISCOVERY_EVIDENCE_PRIORITY.filter((signal) => {
    switch (signal) {
      case 'manual_override':
        return hasManualOverride;
      case 'real_events_or_sessions':
        return hasEventOrSessionEvidence;
      case 'confirmed_venue_activity_mapping':
        return hasVenueActivityMapping;
      case 'structured_activity_signal':
        return hasStructuredActivityEvidence;
      case 'activity_supporting_category':
        return hasActivityCategoryEvidence;
      default:
        return false;
    }
  });

  const hasEligibilityEvidence =
    hasActivityCategoryEvidence
    || hasStructuredActivityEvidence
    || hasVenueActivityMapping
    || hasManualOverride
    || hasEventOrSessionEvidence;

  const isEligible = isHospitalityPrimary
    ? hasManualOverride || hasEventOrSessionEvidence || hasVenueActivityMapping || hasStructuredActivityEvidence
    : hasEligibilityEvidence;

  return {
    isEligible,
    isHospitalityPrimary,
    hasHospitalitySignals,
    hasActivityCategoryEvidence,
    hasStructuredActivityEvidence,
    hasVenueActivityMapping,
    hasManualOverride,
    hasEventOrSessionEvidence,
    evidenceSignals,
  };
};
