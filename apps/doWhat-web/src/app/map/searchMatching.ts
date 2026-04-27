import type { MapActivity } from '@dowhat/shared';

import { matchesDiscoverySearchText } from '@/lib/discovery/searchIntent';

const HOSPITALITY_TOKEN_PATTERN = /\b(bar|cafe|coffee|restaurant|pub|lounge|cocktail|spa|massage|rooftop|shop|retail|mall|nightclub)\b/i;

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

const buildLocalHaystack = (activity: MapActivity): string =>
  [
    activity.name,
    activity.venue,
    activity.place_label,
    ...normalizeList(activity.activity_types),
    ...normalizeList(activity.tags),
    ...normalizeList(activity.taxonomy_categories),
  ]
    .flatMap((value) => (typeof value === 'string' && value.trim().length > 0 ? [normalizeText(value)] : []))
    .join(' ');

const hasLocalStructuredTokenMatch = (activity: MapActivity, token: string): boolean => {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return false;

  const structuredValues = [
    ...normalizeList(activity.activity_types),
    ...normalizeList(activity.tags),
    ...normalizeList(activity.taxonomy_categories),
  ];
  return structuredValues.includes(normalizedToken);
};

const hasLocalTextMatch = (activity: MapActivity, value: string): boolean => {
  const normalizedSearch = normalizeText(value);
  if (!normalizedSearch) return false;

  const haystack = buildLocalHaystack(activity);
  if (haystack.includes(normalizedSearch)) return true;

  const queryTokens = normalizedSearch.split(' ').filter(Boolean);
  if (!queryTokens.length) return false;

  const haystackTokens = new Set(haystack.split(' ').filter(Boolean));
  return queryTokens.every((token) => haystackTokens.has(token));
};

const isHospitalityLike = (activity: MapActivity): boolean =>
  HOSPITALITY_TOKEN_PATTERN.test(
    [activity.name, activity.venue, activity.place_label, ...normalizeList(activity.tags), ...normalizeList(activity.taxonomy_categories)]
      .filter(Boolean)
      .join(' '),
  );

export const matchesActivitySearch = (
  activity: MapActivity,
  input: {
    term: string;
    searchPhrases: string[];
    searchTokens: string[];
    structuredSearchTokens: string[];
  },
): boolean => {
  const term = input.term.trim().toLowerCase();
  if (!term) return true;

  const hasStructuredMultiActivityInput = input.structuredSearchTokens.length >= 2;

  if (hasStructuredMultiActivityInput) {
    return input.structuredSearchTokens.some(
      (token) => hasLocalStructuredTokenMatch(activity, token) || matchesDiscoverySearchText(activity, token),
    );
  }

  const allowLocalRecall = !isHospitalityLike(activity);

  if (allowLocalRecall && hasLocalTextMatch(activity, term)) return true;
  if (matchesDiscoverySearchText(activity, term)) return true;
  if (allowLocalRecall && input.searchPhrases.some((searchWord) => hasLocalTextMatch(activity, searchWord))) return true;
  if (input.searchPhrases.some((searchWord) => matchesDiscoverySearchText(activity, searchWord))) return true;
  return input.searchTokens.some((token) => matchesDiscoverySearchText(activity, token));
};
