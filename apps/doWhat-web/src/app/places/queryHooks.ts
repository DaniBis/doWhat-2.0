"use client";

import { keepPreviousData, useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { placesQueryKey, type FetchPlaces, type PlacesResponse, type PlacesViewportQuery } from "@dowhat/shared";

type PlacesOptions = Omit<UseQueryOptions<PlacesResponse, Error, PlacesResponse>, "queryKey" | "queryFn"> & {
  fetcher: FetchPlaces;
};

export const usePlaces = (
  query: PlacesViewportQuery | null,
  options: PlacesOptions,
): UseQueryResult<PlacesResponse, Error> => {
  const { fetcher, enabled, placeholderData, ...rest } = options;
  return useQuery<PlacesResponse, Error>({
    queryKey: query ? placesQueryKey(query) : ["places", "idle"],
    queryFn: async ({ signal }) => {
      if (!query) throw new Error("Places query is not defined");
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    placeholderData: placeholderData ?? keepPreviousData,
    ...rest,
  });
};
