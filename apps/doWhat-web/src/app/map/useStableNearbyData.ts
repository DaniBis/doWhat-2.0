import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MapActivitiesResponse } from '@dowhat/shared';

export interface StableNearbyState {
  data: MapActivitiesResponse | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
}

export const useStableNearbyData = (
  nearby: UseQueryResult<MapActivitiesResponse, Error>,
): StableNearbyState => {
  const [snapshot, setSnapshot] = useState<MapActivitiesResponse | null>(null);

  useEffect(() => {
    if (nearby.data) {
      setSnapshot(nearby.data);
    }
  }, [nearby.data]);

  const hasSnapshot = snapshot !== null;
  const isInitialLoading = nearby.isLoading && !hasSnapshot;
  const isRefreshing = nearby.isFetching && hasSnapshot;

  return {
    data: snapshot,
    isInitialLoading,
    isRefreshing,
  };
};
