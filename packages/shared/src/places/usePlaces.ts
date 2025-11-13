import { keepPreviousData, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import type { FetchPlaces } from './api';
import type { PlacesResponse, PlacesViewportQuery } from './types';
import { placesQueryKey } from './utils';

export interface UsePlacesOptions
  extends Omit<UseQueryOptions<PlacesResponse, Error, PlacesResponse>, 'queryKey' | 'queryFn'> {
  fetcher: FetchPlaces;
}

export const usePlaces = (
  query: PlacesViewportQuery | null,
  options: UsePlacesOptions,
): UseQueryResult<PlacesResponse, Error> => {
  const {
    fetcher,
    enabled,
    refetchOnWindowFocus,
    refetchOnReconnect,
    refetchOnMount,
    placeholderData,
    ...rest
  } = options;
  return useQuery<PlacesResponse, Error>({
    queryKey: query ? placesQueryKey(query) : ['places', 'idle'],
    queryFn: async ({ signal }) => {
      if (!query) {
        throw new Error('Places query is not defined');
      }
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    staleTime: rest.staleTime ?? 5 * 60_000,
    gcTime: rest.gcTime ?? 10 * 60_000,
    retry: rest.retry ?? 1,
    placeholderData: placeholderData ?? keepPreviousData,
    refetchOnWindowFocus: refetchOnWindowFocus ?? false,
    refetchOnReconnect: refetchOnReconnect ?? false,
    refetchOnMount: refetchOnMount ?? false,
    ...rest,
  });
};
