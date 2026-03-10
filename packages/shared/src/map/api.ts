import type { MapActivitiesQuery, MapActivitiesResponse } from './types';
import { normalizeFilters, serializeFiltersToSearchParams } from './utils';

export type NearbyUrlFactory = (query: MapActivitiesQuery) => string;

export interface CreateNearbyActivitiesFetcherOptions {
  buildUrl: NearbyUrlFactory;
  fetchImpl?: typeof fetch;
  includeCredentials?: boolean;
  timeoutMs?: number;
}

export interface FetchNearbyActivitiesArgs extends MapActivitiesQuery {
  signal?: AbortSignal;
  refresh?: boolean;
}

export type FetchNearbyActivities = (query: FetchNearbyActivitiesArgs) => Promise<MapActivitiesResponse>;

const DEFAULT_NEARBY_FETCH_TIMEOUT_MS = 8_000;

const createAbortError = (message: string) => {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

const createRequestSignal = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason ?? createAbortError('Nearby activities request aborted.'));
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(createAbortError('Nearby activities request timed out.'));
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort(signal.reason ?? createAbortError('Nearby activities request aborted.'));
      return {
        signal: controller.signal,
        cleanup: () => undefined,
        didTimeOut: () => timedOut,
      };
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    },
    didTimeOut: () => timedOut,
  };
};

export const createNearbyActivitiesFetcher = (options: CreateNearbyActivitiesFetcherOptions): FetchNearbyActivities => {
  const { buildUrl, fetchImpl, includeCredentials, timeoutMs = DEFAULT_NEARBY_FETCH_TIMEOUT_MS } = options;
  const http = fetchImpl ?? globalThis.fetch;
  if (!http) {
    throw new Error('Global fetch API is not available. Pass fetchImpl explicitly.');
  }
  return async ({ signal, refresh, ...query }: FetchNearbyActivitiesArgs) => {
    const url = new URL(buildUrl(query));
    url.searchParams.set('lat', String(query.center.lat));
    url.searchParams.set('lng', String(query.center.lng));
    url.searchParams.set('radius', String(Math.max(100, Math.round(query.radiusMeters))));
    if (query.limit) url.searchParams.set('limit', String(Math.max(1, query.limit)));
    if (refresh) url.searchParams.set('refresh', '1');

    const normalizedFilters = normalizeFilters(query.filters);
    const filterParams = serializeFiltersToSearchParams(normalizedFilters);
    filterParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    const request = createRequestSignal(signal, timeoutMs);
    let res: Response;
    try {
      res = await http(url.toString(), {
        method: 'GET',
        signal: request.signal,
        credentials: includeCredentials ? 'include' : 'same-origin',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      if (request.didTimeOut()) {
        throw new Error('Nearby activities request timed out.');
      }
      throw error;
    } finally {
      request.cleanup();
    }

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
