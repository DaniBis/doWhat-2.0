import React from 'react';
import { render, screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MapActivitiesResponse } from '@dowhat/shared';
import { useStableNearbyData } from '../useStableNearbyData';

type QuerySnapshot = Partial<UseQueryResult<MapActivitiesResponse, Error>>;

const makeQuery = (overrides: QuerySnapshot = {}): UseQueryResult<MapActivitiesResponse, Error> =>
  ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    status: 'success',
    fetchStatus: 'idle',
    error: undefined,
    isError: false,
    refetch: jest.fn(),
    remove: jest.fn(),
    isStale: false,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    dataUpdateCount: 0,
    errorUpdateCount: 0,
    isPlaceholderData: false,
    isFetched: Boolean(overrides.data),
    isFetchedAfterMount: Boolean(overrides.data),
    isFetchPending: false,
    ...overrides,
  } as UseQueryResult<MapActivitiesResponse, Error>);

const sampleResponse: MapActivitiesResponse = {
  center: { lat: 0, lng: 0 },
  radiusMeters: 1000,
  count: 1,
  activities: [
    {
      id: 'a-1',
      name: 'Bouldering Crew',
      place_label: 'Dowhat Gym',
      lat: 0,
      lng: 0,
    },
  ],
};

const Harness = ({ query }: { query: UseQueryResult<MapActivitiesResponse, Error> }) => {
  const state = useStableNearbyData(query);
  return (
    <div>
      <span data-testid="count">{state.data?.activities.length ?? 0}</span>
      <span data-testid="initial">{state.isInitialLoading ? 'true' : 'false'}</span>
      <span data-testid="refreshing">{state.isRefreshing ? 'true' : 'false'}</span>
    </div>
  );
};

describe('useStableNearbyData', () => {
  it('preserves the previous dataset while a refetch is in flight', () => {
    const { rerender } = render(<Harness query={makeQuery({ isLoading: true })} />);

    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('initial').textContent).toBe('true');
    expect(screen.getByTestId('refreshing').textContent).toBe('false');

    rerender(<Harness query={makeQuery({ data: sampleResponse })} />);
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('initial').textContent).toBe('false');

    rerender(<Harness query={makeQuery({ isFetching: true })} />);
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('refreshing').textContent).toBe('true');
  });

  it('updates the snapshot when new results arrive', () => {
    const { rerender } = render(<Harness query={makeQuery({ data: sampleResponse })} />);
    expect(screen.getByTestId('count').textContent).toBe('1');

    const updatedResponse: MapActivitiesResponse = {
      ...sampleResponse,
      activities: [...sampleResponse.activities, { ...sampleResponse.activities[0], id: 'a-2' }],
      count: 2,
    };

    rerender(<Harness query={makeQuery({ data: updatedResponse })} />);
    expect(screen.getByTestId('count').textContent).toBe('2');
  });
});
