"use client";

import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import {
  eventsQueryKey,
  mapActivitiesQueryKey,
  type EventsQuery,
  type EventsResponse,
  type FetchEvents,
  type FetchNearbyActivities,
  type MapActivitiesQuery,
  type MapActivitiesResponse,
} from "@dowhat/shared";

type NearbyOptions = Omit<UseQueryOptions<MapActivitiesResponse, Error, MapActivitiesResponse>, "queryKey" | "queryFn"> & {
  fetcher: FetchNearbyActivities;
};

type EventsOptions = Omit<UseQueryOptions<EventsResponse, Error, EventsResponse>, "queryKey" | "queryFn"> & {
  fetcher: FetchEvents;
};

export const useNearbyActivities = (
  query: MapActivitiesQuery | null | undefined,
  options: NearbyOptions,
): UseQueryResult<MapActivitiesResponse, Error> => {
  const { fetcher, enabled, ...rest } = options;
  return useQuery<MapActivitiesResponse, Error>({
    queryKey: query ? mapActivitiesQueryKey(query) : ["mapActivities", "idle"],
    queryFn: async ({ signal }) => {
      if (!query) throw new Error("Map activities query is not defined");
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    ...rest,
  });
};

export const useEvents = (
  query: EventsQuery | null | undefined,
  options: EventsOptions,
): UseQueryResult<EventsResponse, Error> => {
  const { fetcher, enabled, ...rest } = options;
  return useQuery<EventsResponse, Error>({
    queryKey: query ? eventsQueryKey(query) : ["events", "idle"],
    queryFn: async ({ signal }) => {
      if (!query) throw new Error("Events query is not defined");
      return fetcher({ ...query, signal });
    },
    enabled: Boolean(query) && (enabled ?? true),
    ...rest,
  });
};
