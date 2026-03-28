import type { MapActivity } from '@dowhat/shared';

import { matchesDiscoverySearchText } from '@/lib/discovery/searchIntent';

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
    return input.structuredSearchTokens.some((token) => matchesDiscoverySearchText(activity, token));
  }

  if (matchesDiscoverySearchText(activity, term)) return true;
  if (input.searchPhrases.some((searchWord) => matchesDiscoverySearchText(activity, searchWord))) return true;
  return input.searchTokens.some((token) => matchesDiscoverySearchText(activity, token));
};
