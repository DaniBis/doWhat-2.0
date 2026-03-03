import React from 'react';
import { render, screen } from '@testing-library/react';

const useNearbyActivitiesMock = jest.fn();
const useEventsMock = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@dowhat/shared', () => ({
  DEFAULT_RADIUS_METERS: 2000,
  createEventsFetcher: () => jest.fn(),
  createNearbyActivitiesFetcher: () => jest.fn(),
  formatEventTimeRange: () => ({ start: new Date('2026-01-01T00:00:00.000Z'), end: null }),
  sortEventsByStart: (events: unknown[]) => events,
  trackAnalyticsEvent: jest.fn(),
  mapActivitiesQueryKey: () => ['map-activities'],
  useEvents: (...args: unknown[]) => useEventsMock(...args),
  useNearbyActivities: (...args: unknown[]) => useNearbyActivitiesMock(...args),
  DEFAULT_MAP_FILTER_PREFERENCES: {
    activityTypes: [],
    tags: [],
    traits: [],
    taxonomyCategories: [],
    priceLevels: [],
    capacityKey: 'any',
    timeWindow: 'any',
  },
  normaliseMapFilterPreferences: (value: Record<string, unknown>) => ({
    activityTypes: Array.isArray(value.activityTypes) ? value.activityTypes : [],
    tags: Array.isArray(value.tags) ? value.tags : [],
    traits: Array.isArray(value.traits) ? value.traits : [],
    taxonomyCategories: Array.isArray(value.taxonomyCategories) ? value.taxonomyCategories : [],
    priceLevels: Array.isArray(value.priceLevels) ? value.priceLevels : [],
    capacityKey: typeof value.capacityKey === 'string' ? value.capacityKey : 'any',
    timeWindow: typeof value.timeWindow === 'string' ? value.timeWindow : 'any',
  }),
  mapPreferencesToQueryFilters: () => ({
    activityTypes: [],
    tags: [],
    traits: [],
    taxonomyCategories: [],
    priceLevels: [],
    capacityKey: undefined,
    timeWindow: undefined,
  }),
  loadUserPreference: jest.fn(async () => null),
  saveUserPreference: jest.fn(async () => undefined),
  isUuid: (value: string) => typeof value === 'string' && value.length > 0,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/map',
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

jest.mock('@/lib/access/useCoreAccessGuard', () => ({
  useCoreAccessGuard: jest.fn(() => 'allowed'),
}));

jest.mock('@/components/WebMap', () => ({
  __esModule: true,
  default: () => <div data-testid="web-map-stub">Map stub</div>,
}));

jest.mock('@/components/SaveToggleButton', () => ({
  __esModule: true,
  default: () => <button type="button">Save</button>,
}));

import MapPage from '../page';

const originalFetch = globalThis.fetch;

const emptyNearbyState = {
  data: {
    activities: [],
    facets: {
      activityTypes: [],
      tags: [],
      traits: [],
      taxonomyCategories: [],
      priceLevels: [],
      capacityKey: [],
      timeWindow: [],
    },
    filterSupport: {
      activityTypes: true,
      tags: true,
      traits: true,
      taxonomyCategories: true,
      priceLevels: true,
      capacityKey: true,
      timeWindow: true,
    },
  },
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
};

const emptyEventsState = {
  data: { events: [] },
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
};

describe('MapPage smoke', () => {
  beforeEach(() => {
    useNearbyActivitiesMock.mockReset();
    useEventsMock.mockReset();
    useNearbyActivitiesMock.mockReturnValue(emptyNearbyState);
    useEventsMock.mockReturnValue(emptyEventsState);
    (globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
  });

  afterAll(() => {
    if (originalFetch) {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it('renders without crashing with empty discovery payloads', async () => {
    render(<MapPage />);

    expect((await screen.findAllByText(/Refresh search/i)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('web-map-stub')).toBeInTheDocument();
  });
});
