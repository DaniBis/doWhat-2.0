import type {
  CanonicalActivityDefinition,
  CanonicalActivityEvidenceInput,
  CanonicalActivityMatchResult,
  ActivityEvidenceSourceId,
  LaunchVisibleActivityMatchResult,
  VenueTypeId,
} from './types';
import { canonicalActivityDefinitions, searchableCanonicalActivityIds, type CanonicalActivityId } from './taxonomy';

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\p{Pd}_/]+/gu, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueNormalized = (values?: readonly (string | number | null | undefined)[] | null): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => (value == null ? '' : normalizeToken(String(value))))
        .filter(Boolean),
    ),
  );

const aliasToActivity = new Map<string, CanonicalActivityId>();
const definitionsById = new Map<string, CanonicalActivityDefinition>();
canonicalActivityDefinitions.forEach((definition) => {
  const activityId = definition.id as CanonicalActivityId;
  definitionsById.set(activityId, definition);
  [definition.id, definition.displayLabel, ...definition.aliases, ...definition.queryIntent.aliases].forEach((alias) => {
    const normalized = normalizeToken(alias);
    if (normalized && !aliasToActivity.has(normalized)) {
      aliasToActivity.set(normalized, activityId);
    }
  });
});

const CONSUMERIST_VENUE_TYPE_TOKENS = new Map<VenueTypeId, string[]>([
  ['park', ['park', 'garden', 'green space']],
  ['beach', ['beach', 'shore', 'seafront']],
  ['community-centre', ['community center', 'community centre', 'community house']],
  ['cultural-centre', ['cultural center', 'cultural centre', 'cultural house']],
  ['civic-building', ['civic centre', 'civic center', 'public hall', 'public building', 'youth centre', 'youth center', 'children palace', 'childrens palace']],
  ['government-building', ['government building', 'people s committee', 'committee office', 'ward office', 'ministry', 'embassy', 'department office']],
  ['hospitality-venue', ['cafe', 'coffee', 'restaurant', 'bar', 'pub', 'lounge', 'cocktail', 'rooftop', 'hotel', 'spa', 'massage', 'beer garden', 'street food', 'food hall', 'food court']],
  ['unnamed-place', ['unnamed place', 'nearby spot', 'nearby activity', 'nearby venue']],
  ['gym', ['gym', 'fitness centre', 'fitness center']],
  ['sports-centre', ['sports centre', 'sports center', 'sports complex']],
  ['court', ['court']],
  ['pitch', ['pitch', 'field']],
  ['stadium', ['stadium', 'arena']],
  ['climbing-gym', ['climbing gym', 'bouldering gym', 'climbing wall', 'ยิมปีนผา']],
  ['yoga-studio', ['yoga studio']],
  ['pilates-studio', ['pilates studio', 'reformer studio']],
  ['barre-studio', ['barre studio']],
  ['wellness-studio', ['wellness studio', 'meditation center', 'meditation centre']],
  ['crossfit-box', ['crossfit box']],
  ['boxing-gym', ['boxing gym']],
  ['martial-arts-gym', ['dojo', 'martial arts gym']],
  ['fencing-club', ['fencing club']],
  ['racket-club', ['racket club', 'tennis club', 'badminton hall', 'padel club']],
  ['table-tennis-hall', ['table tennis hall', 'ping pong hall']],
  ['pool', ['swimming pool', 'lap pool']],
  ['rowing-club', ['rowing club']],
  ['kayak-centre', ['kayak center', 'kayak centre', 'canoe club']],
  ['surf-school', ['surf school']],
  ['dive-centre', ['dive center', 'dive centre']],
  ['dance-studio', ['dance studio']],
  ['board-game-club', ['board game club', 'tabletop club']],
  ['chess-club', ['chess club']],
  ['billiards-hall', ['billiards hall', 'pool hall', 'snooker hall']],
  ['bowling-alley', ['bowling alley']],
  ['darts-club', ['dart club']],
  ['maker-studio', ['makerspace', 'maker studio', 'workshop']],
  ['art-studio', ['art studio', 'ceramics studio', 'pottery studio']],
  ['music-rehearsal-space', ['rehearsal studio', 'music studio']],
  ['photo-studio', ['photo studio', 'photography studio']],
  ['sauna-studio', ['sauna', 'steam room']],
  ['walking-route', ['walking route', 'promenade']],
  ['running-track', ['running track', 'track']],
  ['trail-network', ['trail', 'hiking trail']],
  ['mountain-trail', ['mountain trail']],
  ['cycling-route', ['bike route', 'cycle route']],
  ['bike-park', ['bike park', 'pump track']],
  ['spin-studio', ['spin studio', 'cycle studio']],
]);

const GENERIC_LAUNCH_BLOCKED_VENUE_TYPES = new Set<VenueTypeId>([
  'park',
  'community-centre',
  'cultural-centre',
  'sports-centre',
  'civic-building',
  'government-building',
  'hospitality-venue',
  'unnamed-place',
]);

const GENERIC_NAME_PATTERNS = [
  /^unnamed(?:\s+(?:place|spot|venue|location))?$/i,
  /^nearby\s+(?:spot|activity|venue)$/i,
  /^[a-z]+\s+spot$/i,
];

const hasTextPhrase = (haystack: string, phrase: string) => {
  if (!phrase) return false;
  if (haystack.includes(` ${phrase} `)) return true;
  return !phrase.includes(' ')
    && haystack.split(' ').some((token) => token === phrase || (phrase.length >= 5 && token.includes(phrase)));
};

const resolveActivityIds = (values?: readonly (string | null | undefined)[] | null): CanonicalActivityId[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => (typeof value === 'string' ? aliasToActivity.get(normalizeToken(value)) : null))
        .filter((value): value is CanonicalActivityId => Boolean(value)),
    ),
  );

const inferVenueTypes = (input: CanonicalActivityEvidenceInput): VenueTypeId[] => {
  const phrases = [
    input.name,
    input.description,
    ...(input.categories ?? []),
    ...(input.tags ?? []),
    ...(input.taxonomyCategories ?? []),
    ...(input.googleTypes ?? []),
    ...(input.foursquareLabels ?? []),
    ...(input.venueTypes ?? []),
    ...Object.entries(input.osmTags ?? {}).flatMap(([key, value]) => [key, value ?? '']),
  ];
  const haystack = ` ${uniqueNormalized(phrases).join(' ')} `;
  const matched = new Set<VenueTypeId>();
  CONSUMERIST_VENUE_TYPE_TOKENS.forEach((tokens, venueType) => {
    if (tokens.some((token) => hasTextPhrase(haystack, normalizeToken(token)))) {
      matched.add(venueType);
    }
  });
  const osmTags = input.osmTags ?? {};
  const sport = normalizeToken(osmTags.sport ?? '');
  const leisure = normalizeToken(osmTags.leisure ?? '');
  const climbingLikeVenue = /\b[\p{L}\p{N}]*climb[\p{L}\p{N}]*\b/iu.test(haystack)
    || /\b[\p{L}\p{N}]*boulder[\p{L}\p{N}]*\b/iu.test(haystack);
  const climbingFacilityShape = haystack.includes(' gym ')
    || haystack.includes(' sports centre ')
    || haystack.includes(' sports center ')
    || haystack.includes(' sports complex ');
  if (climbingLikeVenue && climbingFacilityShape) {
    matched.add('climbing-gym');
  }
  if (sport === 'climbing') matched.add('climbing-gym');
  if (sport === 'padel' || sport === 'tennis' || sport === 'badminton' || sport === 'squash') matched.add('court');
  if (sport === 'table tennis') matched.add('table-tennis-hall');
  if (leisure === 'sports centre' || leisure === 'sports_centre') matched.add('sports-centre');
  if (leisure === 'fitness centre' || leisure === 'fitness_centre') matched.add('gym');
  if (leisure === 'swimming pool' || leisure === 'swimming_pool') matched.add('pool');
  if (leisure === 'pitch') matched.add('pitch');
  if (leisure === 'stadium') matched.add('stadium');
  if (leisure === 'park') matched.add('park');
  if (normalizeToken(input.name ?? '').match(/^unnamed(?:\s+(?:place|spot|venue|location))?$/)) matched.add('unnamed-place');
  return Array.from(matched);
};

const directProviderMatch = (definition: CanonicalActivityDefinition, input: CanonicalActivityEvidenceInput) => {
  const matched: string[] = [];
  const google = new Set(uniqueNormalized(input.googleTypes));
  const fsqIds = new Set(uniqueNormalized(input.foursquareCategoryIds));
  const fsqLabels = new Set(uniqueNormalized(input.foursquareLabels));
  const taxonomy = new Set(uniqueNormalized(input.taxonomyCategories));
  const osmTags = input.osmTags ?? {};
  definition.preferredProviderCategories.googleTypes?.forEach((value) => {
    if (google.has(normalizeToken(value))) matched.push(`google:${value}`);
  });
  definition.preferredProviderCategories.foursquareCategoryIds?.forEach((value) => {
    if (fsqIds.has(normalizeToken(value))) matched.push(`fsq-id:${value}`);
  });
  definition.preferredProviderCategories.foursquareLabels?.forEach((value) => {
    if (fsqLabels.has(normalizeToken(value))) matched.push(`fsq-label:${value}`);
  });
  definition.preferredProviderCategories.internalTaxonomy?.forEach((value) => {
    if (taxonomy.has(normalizeToken(value))) matched.push(`taxonomy:${value}`);
  });
  definition.preferredProviderCategories.osmTags?.forEach((entry) => {
    const current = normalizeToken(osmTags[entry.key] ?? '');
    if (entry.values.some((value) => current === normalizeToken(value))) {
      matched.push(`osm:${entry.key}=${current}`);
    }
  });
  return matched;
};

const buildHaystack = (input: CanonicalActivityEvidenceInput) => {
  const parts = uniqueNormalized([
    input.name,
    input.description,
    ...(input.categories ?? []),
    ...(input.tags ?? []),
    ...(input.taxonomyCategories ?? []),
    ...(input.googleTypes ?? []),
    ...(input.foursquareLabels ?? []),
    ...(input.verifiedActivities ?? []),
    ...(input.aiActivities ?? []),
    ...(input.venueTypes ?? []),
    ...Object.values(input.osmTags ?? {}),
  ]);
  return ` ${parts.join(' ')} `;
};

const clamp = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(3))));

function addEvidence(bucket: CanonicalActivityMatchResult['evidence'], source: ActivityEvidenceSourceId, weight: number, detail: string) {
  bucket.push({ source, weight, detail });
}

export function getCanonicalActivityDefinitions() {
  return canonicalActivityDefinitions;
}

export function getCanonicalActivityDefinition(activityId: string | null | undefined) {
  if (!activityId) return null;
  const resolved = resolveCanonicalActivityId(activityId);
  return resolved ? definitionsById.get(resolved) ?? null : null;
}

export function getSearchableCanonicalActivityIds() {
  return searchableCanonicalActivityIds;
}

export function resolveCanonicalActivityId(value: string | null | undefined): CanonicalActivityId | null {
  if (!value) return null;
  return aliasToActivity.get(normalizeToken(value)) ?? null;
}

export function evaluateCanonicalActivityMatch(
  activityId: string,
  input: CanonicalActivityEvidenceInput,
  mode: 'browse' | 'specific' = 'browse',
): CanonicalActivityMatchResult {
  const resolvedId = resolveCanonicalActivityId(activityId);
  if (!resolvedId) {
    return { activityId, score: 0, eligible: false, strongEvidence: false, hardNegative: false, inferredVenueTypes: [], evidence: [] };
  }
  const definition = definitionsById.get(resolvedId)!;
  const evidence: CanonicalActivityMatchResult['evidence'] = [];
  const inferredVenueTypes = inferVenueTypes(input);
  const haystack = buildHaystack(input);
  const manualIds = new Set(resolveActivityIds(input.manualActivityIds));
  const sessionIds = new Set(resolveActivityIds(input.sessionActivityIds));
  const mappedIds = new Set(resolveActivityIds(input.mappedActivityIds));
  const verifiedIds = new Set(resolveActivityIds(input.verifiedActivities));
  const aiIds = new Set(resolveActivityIds(input.aiActivities));
  const directProvider = directProviderMatch(definition, input);
  const hasVenueType = inferredVenueTypes.some((venueType) => definition.allowedVenueTypes.includes(venueType));
  const aliasMatches = [definition.id, definition.displayLabel, ...definition.aliases, ...definition.queryIntent.aliases]
    .map((value) => normalizeToken(value))
    .filter((value) => hasTextPhrase(haystack, value));
  const hardNegativeHits = definition.hardNegatives
    .map((value) => normalizeToken(value))
    .filter((value) => hasTextPhrase(haystack, value));

  if (manualIds.has(resolvedId)) addEvidence(evidence, 'manual_override', definition.confidenceWeights.manual_override ?? 1, 'manual override');
  if (sessionIds.has(resolvedId)) addEvidence(evidence, 'session_evidence', definition.confidenceWeights.session_evidence ?? 0.97, 'validated session evidence');
  if (mappedIds.has(resolvedId) || verifiedIds.has(resolvedId)) addEvidence(evidence, 'venue_activity_mapping', definition.confidenceWeights.venue_activity_mapping ?? 0.92, 'existing venue mapping');
  if (aiIds.has(resolvedId) && !mappedIds.has(resolvedId) && !verifiedIds.has(resolvedId)) {
    addEvidence(evidence, 'generic_context', Math.max(0.28, (definition.confidenceWeights.generic_context ?? 0.24) + 0.08), 'model activity tag');
  }
  if (directProvider.length) addEvidence(evidence, 'explicit_provider_tag', definition.confidenceWeights.explicit_provider_tag ?? 0.9, directProvider.join(', '));
  if (aliasMatches.length) {
    const source: ActivityEvidenceSourceId = hasVenueType ? 'exact_taxonomy_match' : 'name_alias';
    addEvidence(
      evidence,
      source,
      definition.confidenceWeights[source] ?? (source === 'exact_taxonomy_match' ? 0.84 : 0.68),
      aliasMatches[0],
    );
  }
  if (hasVenueType) addEvidence(evidence, 'compatible_venue_type', definition.confidenceWeights.compatible_venue_type ?? 0.58, inferredVenueTypes.join(', '));
  if (!aliasMatches.length && hasVenueType && directProvider.length) {
    addEvidence(evidence, 'provider_category_match', definition.confidenceWeights.provider_category_match ?? 0.76, 'compatible facility + provider category');
  }
  if (hardNegativeHits.length) addEvidence(evidence, 'hard_negative', definition.confidenceWeights.hard_negative ?? -0.92, hardNegativeHits.join(', '));

  const strongestPositive = evidence.filter((entry) => entry.weight > 0).reduce((max, entry) => Math.max(max, entry.weight), 0);
  const supportBoost = clamp(
    evidence
      .filter((entry) => entry.weight > 0 && entry.weight < strongestPositive)
      .slice(0, 3)
      .reduce((sum, entry) => sum + Math.min(0.12, entry.weight * 0.16), 0),
  );
  const penalty = Math.abs(
    evidence
      .filter((entry) => entry.source === 'hard_negative')
      .reduce((sum, entry) => sum + Math.min(0.7, Math.abs(entry.weight)), 0),
  );
  const score = clamp(strongestPositive + supportBoost - penalty);
  const strongEvidence = evidence.some((entry) => ['manual_override', 'session_evidence', 'venue_activity_mapping', 'explicit_provider_tag', 'exact_taxonomy_match'].includes(entry.source));
  const specificThreshold = definition.queryIntent.specificMinScore;
  const browseThreshold = definition.queryIntent.browseMinScore;
  const hardNegative = hardNegativeHits.length > 0 && !strongEvidence;
  const eligible = mode === 'specific'
    ? score >= specificThreshold && (!definition.queryIntent.requireStrongEvidenceForSpecific || strongEvidence || (aliasMatches.length > 0 && hasVenueType)) && !hardNegative
    : score >= browseThreshold && !hardNegative;

  return { activityId: resolvedId, score, eligible, strongEvidence, hardNegative, inferredVenueTypes, evidence };
}

const MANUAL_OR_VALIDATED_EVIDENCE = new Set<ActivityEvidenceSourceId>([
  'manual_override',
  'session_evidence',
  'venue_activity_mapping',
]);

const PROVIDER_BACKED_EVIDENCE = new Set<ActivityEvidenceSourceId>([
  'explicit_provider_tag',
  'provider_category_match',
]);

const NAMED_ACTIVITY_EVIDENCE = new Set<ActivityEvidenceSourceId>([
  'exact_taxonomy_match',
  'name_alias',
]);

const hasAnyEvidenceSource = (
  result: CanonicalActivityMatchResult,
  sources: Set<ActivityEvidenceSourceId>,
): boolean => result.evidence.some((entry) => sources.has(entry.source));

const isGenericOrUnnamedText = (input: CanonicalActivityEvidenceInput): boolean => {
  const values = [input.name, input.description, ...(input.categories ?? []), ...(input.tags ?? []), ...(input.venueTypes ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  if (!values.length) return true;
  return values.some((value) => GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(value)));
};

const resolveHardNegativeVenueShapes = (
  result: CanonicalActivityMatchResult,
  input: CanonicalActivityEvidenceInput,
) => {
  const inferred = new Set(result.inferredVenueTypes);
  const hardNegativeShapes = new Set<VenueTypeId>();
  inferred.forEach((venueType) => {
    if (GENERIC_LAUNCH_BLOCKED_VENUE_TYPES.has(venueType)) hardNegativeShapes.add(venueType);
  });

  const text = buildHaystack(input);
  if (/\b(civic|public hall|children palace|youth centre|youth center)\b/.test(text)) hardNegativeShapes.add('civic-building');
  if (/\b(government|committee|ministry|embassy|department)\b/.test(text)) hardNegativeShapes.add('government-building');
  if (/\b(cafe|coffee|restaurant|bar|pub|lounge|cocktail|rooftop|hotel|spa|massage)\b/.test(text)) hardNegativeShapes.add('hospitality-venue');
  if (isGenericOrUnnamedText(input)) hardNegativeShapes.add('unnamed-place');
  return Array.from(hardNegativeShapes);
};

export function evaluateLaunchVisibleActivityPlace(
  activityId: string,
  input: CanonicalActivityEvidenceInput,
): LaunchVisibleActivityMatchResult {
  const match = evaluateCanonicalActivityMatch(activityId, input, 'browse');
  const definition = definitionsById.get(match.activityId);
  if (!definition) {
    return {
      activityId,
      visible: false,
      reason: 'unknown_activity',
      policy: null,
      match,
    };
  }

  const policy = definition.launchVisibility;
  if (!match.eligible || match.score < policy.browseVisibilityThreshold) {
    return {
      activityId: match.activityId,
      visible: false,
      reason: 'below_browse_threshold',
      policy,
      match,
    };
  }

  if (hasAnyEvidenceSource(match, MANUAL_OR_VALIDATED_EVIDENCE)) {
    return {
      activityId: match.activityId,
      visible: true,
      reason: 'manual_or_validated_evidence',
      policy,
      match,
    };
  }

  const compatibleVenueTypes = match.inferredVenueTypes.filter((venueType) => definition.allowedVenueTypes.includes(venueType));
  const hardNegativeVenueShapes = resolveHardNegativeVenueShapes(match, input);
  const providerBacked = hasAnyEvidenceSource(match, PROVIDER_BACKED_EVIDENCE);
  const namedActivity = hasAnyEvidenceSource(match, NAMED_ACTIVITY_EVIDENCE);
  const exactNamedActivity = match.evidence.some((entry) => entry.source === 'exact_taxonomy_match');
  const facilityEvidence = match.evidence.some((entry) => entry.source === 'compatible_venue_type');
  const nonGenericFacilityTypes = compatibleVenueTypes.filter((venueType) => !GENERIC_LAUNCH_BLOCKED_VENUE_TYPES.has(venueType));
  const hasAllowedAreaShape = compatibleVenueTypes.some((venueType) => policy.allowedAreaShapes.includes(venueType));
  const disqualifyingHardNegativeShapes = hardNegativeVenueShapes.filter(
    (venueType) => !(policy.visibilityMode === 'area_ok' && policy.allowedAreaShapes.includes(venueType)),
  );
  const strongCounterEvidence = hasAnyEvidenceSource(match, MANUAL_OR_VALIDATED_EVIDENCE)
    || providerBacked
    || ((exactNamedActivity || namedActivity) && facilityEvidence && nonGenericFacilityTypes.length > 0);

  if (policy.suppressGenericShapes && disqualifyingHardNegativeShapes.length > 0 && !strongCounterEvidence) {
    return {
      activityId: match.activityId,
      visible: false,
      reason: 'insufficient_launch_evidence',
      policy,
      match,
    };
  }

  if (facilityEvidence && nonGenericFacilityTypes.length > 0 && (providerBacked || exactNamedActivity || namedActivity)) {
    return {
      activityId: match.activityId,
      visible: true,
      reason: 'facility_supported',
      policy,
      match,
    };
  }

  if (
    policy.visibilityMode === 'area_ok'
    && hasAllowedAreaShape
    && (providerBacked || namedActivity || match.score >= policy.browseVisibilityThreshold)
  ) {
    return {
      activityId: match.activityId,
      visible: true,
      reason: 'area_supported',
      policy,
      match,
    };
  }

  if (policy.visibilityMode === 'program_only' && strongCounterEvidence) {
    return {
      activityId: match.activityId,
      visible: true,
      reason: 'facility_supported',
      policy,
      match,
    };
  }

  if (policy.visibilityMode === 'venue_only' && strongCounterEvidence) {
    return {
      activityId: match.activityId,
      visible: true,
      reason: 'facility_supported',
      policy,
      match,
    };
  }

  return {
    activityId: match.activityId,
    visible: false,
    reason: 'insufficient_launch_evidence',
    policy,
    match,
  };
}

export function isLaunchVisibleActivityPlace(
  activityId: string,
  input: CanonicalActivityEvidenceInput,
): boolean {
  return evaluateLaunchVisibleActivityPlace(activityId, input).visible;
}

export function inferCanonicalActivities(
  input: CanonicalActivityEvidenceInput,
  mode: 'browse' | 'specific' = 'browse',
  limit = 12,
): CanonicalActivityMatchResult[] {
  return canonicalActivityDefinitions
    .filter((definition) => !('searchable' in definition) || definition.searchable !== false)
    .map((definition) => evaluateCanonicalActivityMatch(definition.id, input, mode))
    .filter((result) => result.eligible)
    .sort((left, right) => right.score - left.score || left.activityId.localeCompare(right.activityId))
    .slice(0, limit);
}

export function inferLaunchVisibleCanonicalActivities(
  input: CanonicalActivityEvidenceInput,
  limit = 12,
): CanonicalActivityMatchResult[] {
  return canonicalActivityDefinitions
    .filter((definition) => !('searchable' in definition) || definition.searchable !== false)
    .map((definition) => evaluateLaunchVisibleActivityPlace(definition.id, input))
    .filter((result) => result.visible)
    .map((result) => result.match)
    .sort((left, right) => right.score - left.score || left.activityId.localeCompare(right.activityId))
    .slice(0, limit);
}
