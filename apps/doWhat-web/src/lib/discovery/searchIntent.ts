import { evaluateCanonicalActivityMatch, evaluateLaunchVisibleActivityPlace, resolveCanonicalActivityId } from '@dowhat/shared';

type SearchableDiscoveryItem = {
  name?: string | null;
  venue?: string | null;
  place_label?: string | null;
  tags?: readonly (string | null | undefined)[] | null;
  activity_types?: readonly (string | null | undefined)[] | null;
  taxonomy_categories?: readonly (string | null | undefined)[] | null;
  verification_state?: 'suggested' | 'verified' | 'needs_votes' | null;
  upcoming_session_count?: number | null;
  starts_at?: string | null;
};

const HOSPITALITY_TOKEN_PATTERN = /\b(bar|cafe|coffee|restaurant|pub|lounge|cocktail|spa|massage|rooftop|shop|retail|mall|nightclub)\b/i;
const AMBIGUOUS_STANDALONE_ACTIVITY_TOKENS = new Set(['pool']);

export type DiscoverySearchIntentBucket = {
  activityId: string;
  token: string;
};

export type DiscoverySearchIntentMatch = {
  activityId: string;
  token: string;
  eligible: boolean;
  reason: string;
  visible: boolean;
  visibleReason: string;
  score: number;
  evidenceSources: string[];
};

export type DiscoverySearchIntentDebug = {
  normalizedSearch: string;
  buckets: DiscoverySearchIntentBucket[];
  matchedBuckets: DiscoverySearchIntentMatch[];
  usedPlainTextFallback: boolean;
  matched: boolean;
};

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\p{Pd}_/]+/gu, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeList = (values?: readonly (string | null | undefined)[] | null): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => (typeof value === 'string' ? normalizeText(value) : ''))
        .filter(Boolean),
    ),
  );

const tokenizeSearchText = (value: string): string[] => {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const words = normalized.split(' ').filter(Boolean);
  const candidates = new Set<string>([normalized, ...words]);
  for (let index = 0; index < words.length - 1; index += 1) {
    candidates.add(`${words[index]} ${words[index + 1]}`);
  }
  return Array.from(candidates);
};

export const resolveDiscoverySearchIntentBuckets = (searchText: string | null | undefined): DiscoverySearchIntentBucket[] => {
  const normalizedSearch = typeof searchText === 'string' ? normalizeText(searchText) : '';
  if (!normalizedSearch) return [];

  const buckets: DiscoverySearchIntentBucket[] = [];
  const seen = new Set<string>();
  const resolvedBuckets: Array<{ token: string; activityId: string }> = [];
  tokenizeSearchText(normalizedSearch).forEach((token) => {
    const activityId = resolveCanonicalActivityId(token);
    if (activityId) {
      resolvedBuckets.push({ token, activityId });
    }
  });
  resolvedBuckets.sort((left, right) => {
    const wordDelta = right.token.split(' ').length - left.token.split(' ').length;
    if (wordDelta !== 0) return wordDelta;
    return right.token.length - left.token.length;
  });

  resolvedBuckets.forEach(({ token, activityId }) => {
    if (AMBIGUOUS_STANDALONE_ACTIVITY_TOKENS.has(token)) return;
    if (seen.has(activityId)) return;
    seen.add(activityId);
    buckets.push({ activityId, token });
  });

  return buckets;
};

const buildTextHaystack = (item: SearchableDiscoveryItem): string =>
  [
    item.name,
    item.venue,
    item.place_label,
    ...normalizeList(item.tags),
    ...normalizeList(item.taxonomy_categories),
    ...(item.verification_state === 'verified' ? normalizeList(item.activity_types) : []),
  ].flatMap((value) => (typeof value === 'string' && value.trim().length > 0 ? [normalizeText(value)] : []))
    .join(' ');

const buildTextTokenSet = (item: SearchableDiscoveryItem): Set<string> =>
  new Set(buildTextHaystack(item).split(' ').filter(Boolean));

const evaluateSpecificIntentMatch = (item: SearchableDiscoveryItem, activityId: string, token: string): DiscoverySearchIntentMatch => {
  const verificationState = item.verification_state ?? 'suggested';
  const activityTypes = normalizeList(item.activity_types);
  const tags = normalizeList(item.tags);
  const taxonomyCategories = normalizeList(item.taxonomy_categories);
  const haystack = buildTextHaystack(item);
  const hospitalityLike = HOSPITALITY_TOKEN_PATTERN.test(
    [item.name, item.venue, item.place_label, ...tags, ...taxonomyCategories].filter(Boolean).join(' '),
  );
  const exactStructuredTagMatch = [...tags, ...taxonomyCategories].some((value) => {
    const resolved = resolveCanonicalActivityId(value);
    return resolved === activityId || value === activityId;
  });
  const exactStructuredActivityMatch = activityTypes.includes(activityId);
  const exactVerifiedActivityMatch = exactStructuredActivityMatch && verificationState === 'verified';
  const evidenceInput = {
    name: item.name ?? undefined,
    description: [item.venue, item.place_label].flatMap((value) => (typeof value === 'string' && value.trim().length > 0 ? [value] : [])).join(' ') || undefined,
    categories: [...tags, ...taxonomyCategories],
    tags: [...tags, ...taxonomyCategories],
    taxonomyCategories,
    verifiedActivities: verificationState === 'verified' ? activityTypes : null,
    mappedActivityIds:
      verificationState === 'needs_votes'
        ? activityTypes
        : exactStructuredTagMatch
          ? [activityId]
          : null,
    aiActivities: null,
    sessionActivityIds: (item.upcoming_session_count ?? 0) > 0 || item.starts_at ? [activityId] : null,
    venueTypes: [...tags, ...taxonomyCategories],
  };
  const specific = evaluateCanonicalActivityMatch(activityId, evidenceInput, 'specific');
  const visible = evaluateLaunchVisibleActivityPlace(activityId, evidenceInput);
  const evidenceSources = Array.from(new Set(specific.evidence.map((entry) => entry.source)));

  if (exactVerifiedActivityMatch) {
    return {
      activityId,
      token,
      eligible: true,
      reason: 'exact_activity_type',
      visible: visible.visible,
      visibleReason: visible.reason,
      score: specific.score,
      evidenceSources: ['exact_activity_type', ...evidenceSources],
    };
  }
  if (
    hospitalityLike
    && verificationState !== 'verified'
    && (item.upcoming_session_count ?? 0) <= 0
    && !item.starts_at
  ) {
    return {
      activityId,
      token,
      eligible: false,
      reason: 'hospitality_without_structured_match',
      visible: visible.visible,
      visibleReason: visible.reason,
      score: specific.score,
      evidenceSources,
    };
  }
  if (exactStructuredTagMatch && !hospitalityLike) {
    return {
      activityId,
      token,
      eligible: true,
      reason: 'exact_structured_tag',
      visible: visible.visible,
      visibleReason: visible.reason,
      score: specific.score,
      evidenceSources: ['exact_structured_tag', ...evidenceSources],
    };
  }
  if (token.includes(' ') && !haystack.includes(token)) {
    return {
      activityId,
      token,
      eligible: false,
      reason: 'phrase_not_present',
      visible: visible.visible,
      visibleReason: visible.reason,
      score: specific.score,
      evidenceSources,
    };
  }
  return {
    activityId,
    token,
    eligible: specific.eligible,
    reason: specific.eligible ? 'canonical_specific_intent' : 'below_specific_threshold',
    visible: visible.visible,
    visibleReason: visible.reason,
    score: specific.score,
    evidenceSources,
  };
};

const matchesPlainTextSearch = (item: SearchableDiscoveryItem, searchText: string): boolean => {
  const normalizedSearch = normalizeText(searchText);
  if (!normalizedSearch) return true;
  const haystack = buildTextHaystack(item);
  if (haystack.includes(normalizedSearch)) return true;

  const queryTokens = normalizedSearch.split(' ').filter(Boolean);
  if (!queryTokens.length) return false;

  const haystackTokens = buildTextTokenSet(item);
  return queryTokens.every((token) => haystackTokens.has(token));
};

export const matchesDiscoverySearchText = (item: SearchableDiscoveryItem, searchText: string | null | undefined): boolean => {
  return debugDiscoverySearchText(item, searchText).matched;
};

export const debugDiscoverySearchText = (
  item: SearchableDiscoveryItem,
  searchText: string | null | undefined,
): DiscoverySearchIntentDebug => {
  const normalizedSearch = typeof searchText === 'string' ? normalizeText(searchText) : '';
  if (!normalizedSearch) {
    return {
      normalizedSearch,
      buckets: [],
      matchedBuckets: [],
      usedPlainTextFallback: false,
      matched: true,
    };
  }

  const buckets = resolveDiscoverySearchIntentBuckets(normalizedSearch);

  if (buckets.length) {
    const matchedBuckets = buckets
      .map((bucket) => evaluateSpecificIntentMatch(item, bucket.activityId, bucket.token))
      .filter((bucket) => bucket.eligible);
    return {
      normalizedSearch,
      buckets,
      matchedBuckets,
      usedPlainTextFallback: false,
      matched: matchedBuckets.length > 0,
    };
  }

  const matched = matchesPlainTextSearch(item, normalizedSearch);
  return {
    normalizedSearch,
    buckets: [],
    matchedBuckets: [],
    usedPlainTextFallback: true,
    matched,
  };
};
