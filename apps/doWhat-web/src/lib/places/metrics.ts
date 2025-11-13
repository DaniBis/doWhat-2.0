import { getOptionalServiceClient } from '@/lib/supabase/service';

import { expandCategoryAliases } from './categories';
import type { PlacesQuery, PlaceProvider } from './types';

interface RecordMetricsArgs {
  query: PlacesQuery;
  cacheHit: boolean;
  latencyMs: number;
  providerCounts: Record<PlaceProvider, number>;
}

export const recordPlacesMetrics = async ({ query, cacheHit, latencyMs, providerCounts }: RecordMetricsArgs) => {
  try {
    const service = getOptionalServiceClient();
    if (!service) return;
    await service.from('place_request_metrics').insert({
      sw_lat: query.bounds.sw.lat,
      sw_lng: query.bounds.sw.lng,
      ne_lat: query.bounds.ne.lat,
      ne_lng: query.bounds.ne.lng,
      categories: expandCategoryAliases(query.categories),
      cache_hit: cacheHit,
      latency_ms: Math.round(Math.max(latencyMs, 0)),
      provider_counts: providerCounts,
    });
  } catch (error) {
    // Metrics failures should not break primary flow
    console.error('Failed to record place metrics', error);
  }
};
