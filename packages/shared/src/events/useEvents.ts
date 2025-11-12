import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import type { EventsQuery, EventsResponse } from './types';
import type { FetchEvents } from './api';
import { eventsQueryKey } from './utils';

export interface UseEventsOptions
  extends Omit<UseQueryOptions<EventsResponse, Error, EventsResponse>, 'queryKey' | 'queryFn'> {
  fetcher: FetchEvents;
}

export const useEvents = (
  query: EventsQuery | null | undefined,
  options: UseEventsOptions,
): UseQueryResult<EventsResponse, Error> => {
  const { fetcher, enabled, ...rest } = options;
  return useQuery<EventsResponse, Error>({
    queryKey: query ? eventsQueryKey(query) : ['events', 'idle'],
    queryFn: async ({ signal }) => {
      if (!query) throw new Error('Events query is not defined');
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    staleTime: rest.staleTime ?? 60_000,
    gcTime: rest.gcTime ?? 5 * 60_000,
    retry: rest.retry ?? 2,
    ...rest,
  });
};
