import type { PlacesResponse, PlacesViewportQuery } from './types';

export type FetchPlacesArgs = PlacesViewportQuery & { signal?: AbortSignal };

export type FetchPlaces = (args: FetchPlacesArgs) => Promise<PlacesResponse>;

export interface CreatePlacesFetcherOptions {
  buildUrl: (query: PlacesViewportQuery) => string;
  fetchImpl?: typeof fetch;
  includeCredentials?: boolean;
}

const serializeBounds = (query: PlacesViewportQuery) => {
  const url = new URL('https://example.local/');
  url.searchParams.set('sw', `${query.bounds.sw.lat},${query.bounds.sw.lng}`);
  url.searchParams.set('ne', `${query.bounds.ne.lat},${query.bounds.ne.lng}`);
  if (query.categories?.length) {
    url.searchParams.set('categories', query.categories.join(','));
  }
  if (query.limit) {
    url.searchParams.set('limit', String(query.limit));
  }
  if (query.forceRefresh) {
    url.searchParams.set('force', '1');
  }
  if (query.city) {
    url.searchParams.set('city', query.city);
  }
  return url.searchParams;
};

export const createPlacesFetcher = (options: CreatePlacesFetcherOptions): FetchPlaces => {
  const { buildUrl, fetchImpl, includeCredentials } = options;
  const http = fetchImpl ?? globalThis.fetch;
  if (!http) {
    throw new Error('Global fetch API is not available. Pass fetchImpl explicitly.');
  }

  return async ({ signal, ...query }: FetchPlacesArgs) => {
    const base = new URL(buildUrl(query));
    const params = serializeBounds(query);
    params.forEach((value, key) => {
      base.searchParams.set(key, value);
    });

    try {
      const response = await http(base.toString(), {
        method: 'GET',
        signal,
        credentials: includeCredentials ? 'include' : 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        let errorMessage = `Places request failed (${response.status})`;
        try {
          const payload = await response.json();
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            errorMessage = payload.error;
          }
        } catch (_error) {
          // swallow parse errors
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as PlacesResponse;
      if (!payload || !Array.isArray(payload.places)) {
        throw new Error('Unexpected places response shape.');
      }
      return payload;
    } catch (requestError) {
      if (signal?.aborted) {
        throw requestError;
      }
      throw requestError;
    }
  };
};
