import {
  activityTaxonomy,
  activityTaxonomyVersion,
  defaultTier3Index,
  flattenTaxonomy,
  type ActivityTier3WithAncestors,
} from '@dowhat/shared';

import type { TaxonomyFetchResult } from './types';
import { fetchRemoteTaxonomy } from './fetch';

const STALE_AFTER_MS = 5 * 60 * 1000;

let cachedTaxonomy: TaxonomyFetchResult | null = null;
let cachedTier3Index: ActivityTier3WithAncestors[] = defaultTier3Index;
let inFlight: Promise<TaxonomyFetchResult> | null = null;

const bundleFallback: TaxonomyFetchResult = {
  taxonomy: activityTaxonomy,
  version: activityTaxonomyVersion,
  fetchedAt: 0,
};

export const getCachedTaxonomy = () => cachedTaxonomy ?? bundleFallback;
export const getCachedTier3Index = () => cachedTier3Index;

export async function loadTaxonomy(forceRefresh = false): Promise<TaxonomyFetchResult> {
  if (!forceRefresh && cachedTaxonomy && Date.now() - cachedTaxonomy.fetchedAt < STALE_AFTER_MS) {
    return cachedTaxonomy;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchRemoteTaxonomy()
    .then((result) => {
      cachedTaxonomy = result;
      cachedTier3Index = flattenTaxonomy(result.taxonomy);
      return result;
    })
    .catch((error) => {
      console.warn('[taxonomy] fetch failed, using cached/bundle', error);
      return cachedTaxonomy ?? bundleFallback;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
