import type { MapActivitiesQuery, MapActivitiesResponse } from './types';
import { normalizeFilters, serializeFiltersToSearchParams } from './utils';

export type NearbyUrlFactory = (query: MapActivitiesQuery) => string;

export interface CreateNearbyActivitiesFetcherOptions {
  buildUrl: NearbyUrlFactory;
  fetchImpl?: typeof fetch;
  includeCredentials?: boolean;
}

export interface FetchNearbyActivitiesArgs extends MapActivitiesQuery {
  signal?: AbortSignal;
}

export type FetchNearbyActivities = (query: FetchNearbyActivitiesArgs) => Promise<MapActivitiesResponse>;

export const createNearbyActivitiesFetcher = (options: CreateNearbyActivitiesFetcherOptions): FetchNearbyActivities => {
  const { buildUrl, fetchImpl, includeCredentials } = options;
  const http = fetchImpl ?? globalThis.fetch;
  if (!http) {
    throw new Error('Global fetch API is not available. Pass fetchImpl explicitly.');
  }
  return async ({ signal, ...query }: FetchNearbyActivitiesArgs) => {
    const url = new URL(buildUrl(query));
    url.searchParams.set('lat', String(query.center.lat));
    url.searchParams.set('lng', String(query.center.lng));
    url.searchParams.set('radius', String(Math.max(100, Math.round(query.radiusMeters))));
    if (query.limit) url.searchParams.set('limit', String(Math.max(1, query.limit)));

    const normalizedFilters = normalizeFilters(query.filters);
    const filterParams = serializeFiltersToSearchParams(normalizedFilters);
    filterParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    const res = await http(url.toString(), {
      method: 'GET',
      signal,
      credentials: includeCredentials ? 'include' : 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      let info: unknown = null;
      try {
        info = await res.json();
      } catch {
        // ignore
      }
      const message =
        (typeof info === 'object' && info && 'error' in info && typeof (info as { error?: unknown }).error === 'string'
          ? (info as { error: string }).error
          : null) || `Failed to load nearby activities (${res.status})`;
      throw new Error(message);
    }

    const payload = (await res.json()) as MapActivitiesResponse;
    if (!payload || !Array.isArray(payload.activities)) {
      throw new Error('Unexpected nearby activities response shape.');
    }
    return payload;
  };
};
