import type { MapActivity } from '@dowhat/shared';

const STRUCTURED_SEARCH_DELIMITER = /[,;|/]/;

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
  return `${name} ${venue} ${place} ${tags} ${types}`;
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
    return input.structuredSearchTokens.some((token) => typeTokens.has(token) || tagTokens.has(token));
  }

  const haystack = buildHaystack(activity);
  if (haystack.includes(term)) return true;
  if (input.searchPhrases.some((searchWord) => haystack.includes(searchWord))) return true;

  if (input.searchTokens.length > 0) {
    const typeTokens = normalizeSet(activity.activity_types);
    const tagTokens = normalizeSet(activity.tags);
    return input.searchTokens.some((token) => typeTokens.has(token) || tagTokens.has(token));
  }

  return false;
};
