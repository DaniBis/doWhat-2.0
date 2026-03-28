import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MapActivitiesResponse } from '@dowhat/shared';

export interface StableNearbyState {
  data: MapActivitiesResponse | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
}

export interface UseStableNearbyDataOptions {
  enabled?: boolean;
}

const sameActivityList = (left: MapActivitiesResponse['activities'], right: MapActivitiesResponse['activities']): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftActivity = left[index];
    const rightActivity = right[index];
    if (
      leftActivity?.id !== rightActivity?.id
      || leftActivity?.name !== rightActivity?.name
      || leftActivity?.place_label !== rightActivity?.place_label
      || leftActivity?.lat !== rightActivity?.lat
      || leftActivity?.lng !== rightActivity?.lng
    ) {
      return false;
    }
  }

  return true;
};

const sameNearbyResponse = (left: MapActivitiesResponse | null, right: MapActivitiesResponse | null | undefined): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.count === right.count
    && left.radiusMeters === right.radiusMeters
    && left.center?.lat === right.center?.lat
    && left.center?.lng === right.center?.lng
    && sameActivityList(left.activities, right.activities)
  );
};

export const useStableNearbyData = (
  nearby: UseQueryResult<MapActivitiesResponse, Error>,
  options: UseStableNearbyDataOptions = {},
): StableNearbyState => {
  const { enabled = true } = options;
  const [snapshot, setSnapshot] = useState<MapActivitiesResponse | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshot((current) => (current === null ? current : null));
      return;
    }
    if (nearby.data && !sameNearbyResponse(snapshot, nearby.data)) {
      setSnapshot(nearby.data);
    }
  }, [enabled, nearby.data, snapshot]);

  const hasSnapshot = snapshot !== null;
  const isInitialLoading = nearby.isLoading && !hasSnapshot;
  const isRefreshing = nearby.isFetching && hasSnapshot;

  return {
    data: snapshot,
    isInitialLoading,
    isRefreshing,
  };
};
