import type { MapActivitiesQuery, MapActivitiesResponse } from './types';
import { normalizeFilters, serializeFiltersToSearchParams } from './utils';

export type NearbyUrlFactory = (query: MapActivitiesQuery) => string;

export interface CreateNearbyActivitiesFetcherOptions {
  buildUrl: NearbyUrlFactory;
  fetchImpl?: typeof fetch;
  includeCredentials?: boolean;
  timeoutMs?: number;
  getRequestHeaders?: (query: MapActivitiesQuery) => HeadersInit | undefined;
  onRequestStart?: (info: {
    url: string;
    query: MapActivitiesQuery;
    refresh: boolean;
    timeoutMs: number;
    requestId: string | null;
  }) => void;
  onRequestEnd?: (info: {
    url: string;
    query: MapActivitiesQuery;
    refresh: boolean;
    timeoutMs: number;
    requestId: string | null;
    durationMs: number;
    timedOut: boolean;
    responseStatus?: number;
    resultCount?: number;
    errorMessage?: string;
    response?: MapActivitiesResponse;
  }) => void;
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
  const {
    buildUrl,
    fetchImpl,
    includeCredentials,
    timeoutMs = DEFAULT_NEARBY_FETCH_TIMEOUT_MS,
    getRequestHeaders,
    onRequestStart,
    onRequestEnd,
  } = options;
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

    const requestHeaders = new Headers({
      Accept: 'application/json',
    });
    const customHeaders = getRequestHeaders?.(query);
    if (customHeaders) {
      const normalizedHeaders = new Headers(customHeaders);
        normalizedHeaders.forEach((value: string, key: string) => requestHeaders.set(key, value));
    }
    const requestId = requestHeaders.get('x-map-request-id');
    const startedAt = Date.now();
    onRequestStart?.({
      url: url.toString(),
      query,
      refresh: Boolean(refresh),
      timeoutMs,
      requestId,
    });

    const request = createRequestSignal(signal, timeoutMs);
    let res: Response;
    try {
      res = await http(url.toString(), {
        method: 'GET',
        signal: request.signal,
        credentials: includeCredentials ? 'include' : 'same-origin',
        headers: requestHeaders,
      });
    } catch (error) {
      onRequestEnd?.({
        url: url.toString(),
        query,
        refresh: Boolean(refresh),
        timeoutMs,
        requestId,
        durationMs: Date.now() - startedAt,
        timedOut: request.didTimeOut(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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
      onRequestEnd?.({
        url: url.toString(),
        query,
        refresh: Boolean(refresh),
        timeoutMs,
        requestId,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        responseStatus: res.status,
        errorMessage: message,
      });
      throw new Error(message);
    }

    const payload = (await res.json()) as MapActivitiesResponse;
    if (!payload || !Array.isArray(payload.activities)) {
      onRequestEnd?.({
        url: url.toString(),
        query,
        refresh: Boolean(refresh),
        timeoutMs,
        requestId,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        responseStatus: res.status,
        errorMessage: 'Unexpected nearby activities response shape.',
      });
      throw new Error('Unexpected nearby activities response shape.');
    }
    onRequestEnd?.({
      url: url.toString(),
      query,
      refresh: Boolean(refresh),
      timeoutMs,
      requestId,
      durationMs: Date.now() - startedAt,
      timedOut: false,
      responseStatus: res.status,
      resultCount: payload.count,
      response: payload,
    });
    return payload;
  };
};
