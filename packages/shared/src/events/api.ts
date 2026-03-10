import { serializeDiscoveryFilterContractToSearchParams } from '../discovery';
import type { EventsQuery, EventsResponse } from './types';
import { normalizeEventsQuery } from './utils';

export interface CreateEventsFetcherOptions {
  buildUrl: (query: EventsQuery) => string;
  fetchImpl?: typeof fetch;
  includeCredentials?: boolean;
}

export interface FetchEventsArgs extends EventsQuery {
  signal?: AbortSignal;
}

export type FetchEvents = (query: FetchEventsArgs) => Promise<EventsResponse>;

const setCoordinateParam = (url: URL, key: 'sw' | 'ne', value?: { lat: number; lng: number }) => {
  if (!value) return;
  url.searchParams.set(key, `${value.lat},${value.lng}`);
};

export const createEventsFetcher = (options: CreateEventsFetcherOptions): FetchEvents => {
  const { buildUrl, fetchImpl, includeCredentials } = options;
  const http = fetchImpl ?? globalThis.fetch;
  if (!http) throw new Error('Global fetch API is not available.');

  return async ({ signal, ...query }: FetchEventsArgs) => {
    const url = new URL(buildUrl(query));
    const normalized = normalizeEventsQuery(query);
    const filterParams = serializeDiscoveryFilterContractToSearchParams({
      resultKinds: normalized.filters.resultKinds,
      searchText: normalized.filters.searchText,
      activityTypes: normalized.filters.activityTypes,
      tags: normalized.filters.tags,
      taxonomyCategories: normalized.filters.taxonomyCategories,
      trustMode: normalized.filters.trustMode,
    });

    for (const [key, value] of filterParams.entries()) {
      url.searchParams.set(key, value);
    }
    setCoordinateParam(url, 'sw', query.sw);
    setCoordinateParam(url, 'ne', query.ne);
    if (query.from) url.searchParams.set('from', query.from);
    if (query.to) url.searchParams.set('to', query.to);
    if (query.limit) url.searchParams.set('limit', String(query.limit));
    if (typeof query.minAccuracy === 'number' && Number.isFinite(query.minAccuracy)) {
      url.searchParams.set('minAccuracy', String(Math.max(0, Math.min(100, Math.round(query.minAccuracy)))));
    }

    const response = await http(url.toString(), {
      method: 'GET',
      signal,
      credentials: includeCredentials ? 'include' : 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        // ignore parsing failures
      }
      const message =
        payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : `Events request failed (${response.status})`;
      throw new Error(message);
    }

    const data = (await response.json()) as EventsResponse;
    if (!data || !Array.isArray(data.events)) {
      throw new Error('Unexpected /events response payload.');
    }
    return data;
  };
};
