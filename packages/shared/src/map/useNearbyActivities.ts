import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import type { FetchNearbyActivities } from './api';
import type { MapActivitiesQuery, MapActivitiesResponse } from './types';
import { mapActivitiesQueryKey } from './utils';

export interface UseNearbyActivitiesOptions
  extends Omit<UseQueryOptions<MapActivitiesResponse, Error, MapActivitiesResponse>, 'queryKey' | 'queryFn'> {
  fetcher: FetchNearbyActivities;
}

export const useNearbyActivities = (
  query: MapActivitiesQuery | null | undefined,
  options: UseNearbyActivitiesOptions,
): UseQueryResult<MapActivitiesResponse, Error> => {
  const { fetcher, enabled, ...rest } = options;
  return useQuery<MapActivitiesResponse, Error>({
    queryKey: query ? mapActivitiesQueryKey(query) : ['mapActivities', 'idle'],
    queryFn: async ({ signal }) => {
      if (!query) {
        throw new Error('Map activities query is not defined');
      }
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    staleTime: rest.staleTime ?? 60_000,
    gcTime: rest.gcTime ?? 5 * 60_000,
    retry: rest.retry ?? 2,
    ...rest,
  });
};
