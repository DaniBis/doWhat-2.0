import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useNearbyActivitiesMock = jest.fn();
const useEventsMock = jest.fn();
const mockGetCurrentPosition = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
  }),
}));

jest.mock('../queryHooks', () => ({
  useEvents: (...args: unknown[]) => useEventsMock(...args),
  useNearbyActivities: (...args: unknown[]) => useNearbyActivitiesMock(...args),
}));

jest.mock('@dowhat/shared', () => ({
  DEFAULT_RADIUS_METERS: 2000,
  listCities: () => [
    {
      slug: 'hanoi',
      name: 'Hanoi',
      label: 'Hanoi',
      scopeAliases: ['ha noi'],
      center: { lat: 21.0285, lng: 105.8542 },
      defaultZoom: 12,
      defaultRegion: { latitudeDelta: 0.2, longitudeDelta: 0.2 },
      bbox: {
        sw: { lat: 20.8, lng: 105.6 },
        ne: { lat: 21.4, lng: 106.0 },
      },
      enabledCategories: [],
    },
  ],
  createEventsFetcher: () => jest.fn(),
  createNearbyActivitiesFetcher: () => jest.fn(),
  resolveCanonicalActivityId: (value: string | null | undefined) => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'climb' || normalized === 'climbing') return 'climbing';
    if (normalized === 'billiards' || normalized === 'pool') return 'billiards';
    if (normalized === 'chess') return 'chess';
    return null;
  },
  evaluateCanonicalActivityMatch: (
    activityId: string,
    evidence: {
      categories?: string[] | null;
      tags?: string[] | null;
      taxonomyCategories?: string[] | null;
      verifiedActivities?: string[] | null;
      mappedActivityIds?: string[] | null;
      sessionActivityIds?: string[] | null;
      venueTypes?: string[] | null;
    },
  ) => {
    const values = [
      ...(evidence.categories ?? []),
      ...(evidence.tags ?? []),
      ...(evidence.taxonomyCategories ?? []),
      ...(evidence.verifiedActivities ?? []),
      ...(evidence.mappedActivityIds ?? []),
      ...(evidence.sessionActivityIds ?? []),
      ...(evidence.venueTypes ?? []),
    ]
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase());
    const eligible = values.some((entry) => entry === activityId || entry.includes(activityId));
    return {
      eligible,
      score: eligible ? 1 : 0,
      evidence: eligible ? [{ source: 'mock_match' }] : [],
    };
  },
  evaluateLaunchVisibleActivityPlace: (activityId: string, evidence: { verifiedActivities?: string[] | null; mappedActivityIds?: string[] | null }) => {
    const values = [...(evidence.verifiedActivities ?? []), ...(evidence.mappedActivityIds ?? [])]
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase());
    const visible = values.length === 0 || values.includes(activityId);
    return {
      visible,
      reason: visible ? 'mock_visible' : 'mock_hidden',
    };
  },
  buildEventVerificationProgress: () => null,
  describeEventDiscoveryPresentation: (event: { origin_kind?: string | null; url?: string | null; metadata?: Record<string, unknown> | null }) => {
    if (event.origin_kind === 'session' || event.metadata?.source === 'session') {
      return {
        badgeLabel: 'doWhat session',
        helper: 'Hosted on doWhat at a confirmed place. RSVPs stay on the session page.',
        primaryActionLabel: 'View session',
        primaryActionKind: 'view_session',
        secondaryActionLabel: null,
      };
    }
    return {
      badgeLabel: 'Imported event',
      helper: 'Published by an external source. Attendance stays on the source page.',
      primaryActionLabel: 'View event',
      primaryActionKind: 'view_event',
      secondaryActionLabel: typeof event.url === 'string' && event.url.startsWith('http') ? 'View source' : null,
    };
  },
  formatEventTimeRange: () => ({ start: new Date('2026-01-01T00:00:00.000Z'), end: null }),
  resolvePlaceBranding: ({ name }: { name?: string | null }) => ({
    logoUrl: null,
    wordmarkUrl: null,
    initials: typeof name === 'string' && name.trim() ? name.trim().slice(0, 2).toUpperCase() : 'DW',
    displayName: typeof name === 'string' && name.trim() ? name.trim() : 'Place',
  }),
  getEventSessionId: (event: { metadata?: Record<string, unknown> | null }) => {
    const candidate = event.metadata?.sessionId ?? event.metadata?.session_id;
    return typeof candidate === 'string' ? candidate : null;
  },
  inferEventLocationKind: (event: { location_kind?: string | null; place_id?: string | null; metadata?: Record<string, unknown> | null; place_label?: string | null; venue_name?: string | null; address?: string | null; lat?: number | null; lng?: number | null }) => {
    if (event.location_kind) return event.location_kind;
    if (event.place_id) return 'canonical_place';
    if (event.metadata?.venueId) return 'legacy_venue';
    if (event.place_label || event.venue_name || event.address || (typeof event.lat === 'number' && typeof event.lng === 'number')) {
      return 'custom_location';
    }
    return 'flexible';
  },
  sortEventsByStart: (events: unknown[]) => events,
  trackAnalyticsEvent: jest.fn(),
  mapActivitiesQueryKey: () => ['map-activities'],
  DEFAULT_MAP_FILTER_PREFERENCES: {
    activityTypes: [],
    tags: [],
    traits: [],
    taxonomyCategories: [],
    priceLevels: [],
    capacityKey: 'any',
    timeWindow: 'any',
    trustMode: 'all',
  },
  normaliseMapFilterPreferences: (value: Record<string, unknown>) => ({
    activityTypes: Array.isArray(value.activityTypes) ? value.activityTypes : [],
    tags: Array.isArray(value.tags) ? value.tags : [],
    traits: Array.isArray(value.traits) ? value.traits : [],
    taxonomyCategories: Array.isArray(value.taxonomyCategories) ? value.taxonomyCategories : [],
    priceLevels: Array.isArray(value.priceLevels) ? value.priceLevels : [],
    capacityKey: typeof value.capacityKey === 'string' ? value.capacityKey : 'any',
    timeWindow: typeof value.timeWindow === 'string' ? value.timeWindow : 'any',
    trustMode: typeof value.trustMode === 'string' ? value.trustMode : 'all',
  }),
  mapPreferencesToQueryFilters: () => ({
    activityTypes: [],
    tags: [],
    traits: [],
    taxonomyCategories: [],
    priceLevels: [],
    capacityKey: undefined,
    timeWindow: undefined,
    trustMode: undefined,
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

const makeNearbyState = (overrides: Record<string, unknown> = {}) => ({
  ...emptyNearbyState,
  ...overrides,
});

const browseActivity = {
  id: 'browse-park',
  name: 'West Lake Park Loop',
  place_label: 'West Lake Park Loop',
  venue: 'West Lake Park Loop',
  lat: 21.0285,
  lng: 105.8542,
  activity_types: ['running', 'walking'],
  tags: ['park'],
  taxonomy_categories: ['outdoors'],
  traits: [],
  upcoming_session_count: 0,
  source: 'supabase-places',
};

const climbingActivity = {
  id: 'strict-climb',
  name: 'VietClimb',
  place_label: 'VietClimb',
  venue: 'VietClimb',
  lat: 21.03,
  lng: 105.85,
  activity_types: ['climbing'],
  tags: ['climbing'],
  taxonomy_categories: ['fitness_climbing'],
  traits: [],
  upcoming_session_count: 0,
  source: 'supabase-places',
};

const openFiltersAndSearch = async (value: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  const input = document.getElementById('map-filter-search') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value } });
};

describe('MapPage smoke', () => {
  beforeEach(() => {
    useNearbyActivitiesMock.mockReset();
    useEventsMock.mockReset();
    mockGetCurrentPosition.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
          success({
            coords: {
              latitude: browseActivity.lat,
              longitude: browseActivity.lng,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          } as GeolocationPosition);
        }),
      },
    });
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

  it('renders real filter controls without placeholder unavailable copy', async () => {
    useNearbyActivitiesMock.mockReturnValue({
      ...emptyNearbyState,
      data: {
        activities: [],
        facets: {
          activityTypes: [{ value: 'climbing', count: 3 }],
          tags: [],
          traits: [{ value: 'curious', count: 2 }],
          taxonomyCategories: [{ value: 'fitness_climbing', count: 2 }],
          priceLevels: [{ value: '2', count: 2 }],
          capacityKey: [{ value: 'small', count: 2 }],
          timeWindow: [{ value: 'evening', count: 2 }],
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
    });

    render(<MapPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('button', { name: 'climbing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'curious' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fitness climbing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmed only/i })).toBeInTheDocument();

    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/appear when/i)).not.toBeInTheDocument();
  });

  it('hides unsupported filter sections instead of rendering fallback warnings', async () => {
    useNearbyActivitiesMock.mockReturnValue({
      ...emptyNearbyState,
      data: {
        activities: [],
        facets: {
          activityTypes: [{ value: 'yoga', count: 4 }],
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
          traits: false,
          taxonomyCategories: false,
          priceLevels: false,
          capacityKey: false,
          timeWindow: false,
        },
      },
    });

    render(<MapPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('button', { name: 'yoga' })).toBeInTheDocument();
    expect(screen.queryByText('People vibe')).not.toBeInTheDocument();
    expect(screen.queryByText('Specific categories')).not.toBeInTheDocument();
    expect(screen.queryByText('Price levels')).not.toBeInTheDocument();
    expect(screen.queryByText('Group size')).not.toBeInTheDocument();
    expect(screen.queryByText('Time window')).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/appear when/i)).not.toBeInTheDocument();
  });

  it('renders trust strictness as an active filter chip when selected', async () => {
    render(<MapPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmed only/i }));

    expect(screen.getAllByText('Confirmed only').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Price levels')).not.toBeInTheDocument();
    expect(screen.queryByText('Group size')).not.toBeInTheDocument();
    expect(screen.queryByText('Time window')).not.toBeInTheDocument();
  });

  it('renders session mirrors and imported events with distinct labels and CTAs', async () => {
    useEventsMock.mockReturnValue({
      ...emptyEventsState,
      data: {
        events: [
          {
            id: 'session-1',
            title: 'Morning Climb',
            start_at: '2026-01-01T10:00:00.000Z',
            end_at: null,
            timezone: 'UTC',
            venue_name: 'Peak Climb',
            place_label: 'Peak Climb',
            lat: 44.43,
            lng: 26.1,
            address: null,
            url: '/sessions/session-1',
            image_url: null,
            status: 'scheduled',
            event_state: 'scheduled',
            tags: ['climbing'],
            place_id: 'place-1',
            source_id: null,
            source_uid: 'session-1',
            metadata: { source: 'session', sessionId: 'session-1' },
            origin_kind: 'session',
            location_kind: 'canonical_place',
            reliability_score: 92,
          },
          {
            id: 'event-2',
            title: 'Imported board game night',
            start_at: '2026-01-02T10:00:00.000Z',
            end_at: null,
            timezone: 'UTC',
            venue_name: 'Play House',
            place_label: 'Play House',
            lat: 44.44,
            lng: 26.11,
            address: null,
            url: 'https://source.example/event-2',
            image_url: null,
            status: 'verified',
            event_state: 'scheduled',
            tags: ['board games'],
            place_id: null,
            source_id: 'provider',
            source_uid: 'provider-2',
            metadata: { sourceUrl: 'https://source.example/event-2' },
            origin_kind: 'event',
            location_kind: 'custom_location',
            reliability_score: 77,
          },
        ],
      },
    });

    render(<MapPage />);

    expect(await screen.findByText('Sessions & events')).toBeInTheDocument();
    expect(screen.getByText('doWhat session')).toBeInTheDocument();
    expect(screen.getByText('Imported event')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View event' })).toBeInTheDocument();
    expect(screen.queryByText(/View details/i)).not.toBeInTheDocument();
  });

  it('clears stale browse rows when a strict search times out', async () => {
    useNearbyActivitiesMock.mockImplementation((query: { filters?: { searchText?: string } } | null) => {
      if (query?.filters?.searchText) {
        return makeNearbyState({
          data: undefined,
          isError: true,
          error: new Error('Nearby activities request timed out.'),
        });
      }

      return makeNearbyState({
        data: {
          ...emptyNearbyState.data,
          activities: [browseActivity],
        },
      });
    });

    render(<MapPage />);
    await waitFor(() => {
      expect(screen.getAllByText('West Lake Park Loop').length).toBeGreaterThan(0);
    });

    await openFiltersAndSearch('climb');

    expect(await screen.findByText('Nearby activities request timed out.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryAllByText('West Lake Park Loop')).toHaveLength(0);
    });
    expect(screen.getByText('Search could not be completed. Retry or widen the radius to run it again.')).toBeInTheDocument();
  });

  it('shows only strict search rows and never falls back to broad browse inventory', async () => {
    useNearbyActivitiesMock.mockImplementation((query: { filters?: { searchText?: string } } | null) => {
      if (query?.filters?.searchText === 'billiards chess climb') {
        return makeNearbyState({
          data: {
            ...emptyNearbyState.data,
            activities: [climbingActivity],
          },
        });
      }

      return makeNearbyState({
        data: {
          ...emptyNearbyState.data,
          activities: [browseActivity],
        },
      });
    });

    render(<MapPage />);
    await waitFor(() => {
      expect(screen.getAllByText('West Lake Park Loop').length).toBeGreaterThan(0);
    });

    await openFiltersAndSearch('billiards chess climb');

    await waitFor(() => {
      expect(screen.getAllByText('VietClimb').length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.queryAllByText('West Lake Park Loop')).toHaveLength(0);
    });
  });

  it('renders a truthful empty state for chess instead of browse rows', async () => {
    useNearbyActivitiesMock.mockImplementation((query: { filters?: { searchText?: string } } | null) => {
      if (query?.filters?.searchText === 'chess') {
        return makeNearbyState({
          data: {
            ...emptyNearbyState.data,
            activities: [],
          },
        });
      }

      return makeNearbyState({
        data: {
          ...emptyNearbyState.data,
          activities: [browseActivity],
        },
      });
    });

    render(<MapPage />);
    await waitFor(() => {
      expect(screen.getAllByText('West Lake Park Loop').length).toBeGreaterThan(0);
    });

    await openFiltersAndSearch('chess');

    await waitFor(() => {
      expect(screen.queryAllByText('West Lake Park Loop')).toHaveLength(0);
    });
    expect(await screen.findByText('No activities match "chess". Try another name or clear the search.')).toBeInTheDocument();
  });

  it('uses the reduced Hanoi strict search limit for live climb-style queries', async () => {
    useNearbyActivitiesMock.mockImplementation((query: { filters?: { searchText?: string }; radiusMeters?: number; limit?: number } | null) => {
      if (query?.filters?.searchText === 'climb') {
        return makeNearbyState({
          data: {
            ...emptyNearbyState.data,
            activities: [climbingActivity],
          },
        });
      }

      return makeNearbyState({
        data: {
          ...emptyNearbyState.data,
          activities: [browseActivity],
        },
      });
    });

    render(<MapPage />);
    await openFiltersAndSearch('climb');

    await waitFor(() => {
      expect(
        useNearbyActivitiesMock.mock.calls.some(([query]) => query?.filters?.searchText === 'climb' && query?.radiusMeters === 25_000 && query?.limit === 250),
      ).toBe(true);
    });
  });
});
