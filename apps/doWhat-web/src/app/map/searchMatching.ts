import type { MapActivity } from '@dowhat/shared';

import { matchesDiscoverySearchText } from '@/lib/discovery/searchIntent';

const STRUCTURED_SEARCH_DELIMITER = /[,;|/]/;
const HOSPITALITY_TOKEN_PATTERN = /\b(bar|cafe|coffee|restaurant|pub|lounge|cocktail|spa|massage|rooftop|shop|retail|mall|nightclub)\b/i;

const normalizeSet = (values?: (string | null | undefined)[] | null): Set<string> => {
  const set = new Set<string>();
  (values ?? []).forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  });
  return set;
};

const buildHaystack = (activity: MapActivity): string => {
  const name = activity.name?.toLowerCase() ?? '';
  const venue = activity.venue?.toLowerCase() ?? '';
  const place = activity.place_label?.toLowerCase() ?? '';
  const tags = (activity.tags ?? []).join(' ').toLowerCase();
  const types = (activity.activity_types ?? []).join(' ').toLowerCase();
  const taxonomy = (activity.taxonomy_categories ?? []).join(' ').toLowerCase();
  return `${name} ${venue} ${place} ${tags} ${types} ${taxonomy}`;
};

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

  const hasStructuredMultiActivityInput =
    STRUCTURED_SEARCH_DELIMITER.test(term) && input.structuredSearchTokens.length >= 2;
  if (hasStructuredMultiActivityInput) {
    const typeTokens = normalizeSet(activity.activity_types);
    const tagTokens = normalizeSet(activity.tags);
    const taxonomyTokens = normalizeSet(activity.taxonomy_categories);
    return input.structuredSearchTokens.some((token) =>
      typeTokens.has(token) || tagTokens.has(token) || taxonomyTokens.has(token),
    );
  }

  if (matchesDiscoverySearchText(activity, term)) {
    return true;
  }

  const haystack = buildHaystack(activity);
  if (input.searchPhrases.some((searchPhrase) => haystack.includes(searchPhrase))) {
    return !HOSPITALITY_TOKEN_PATTERN.test(haystack);
  }

  return false;
};
