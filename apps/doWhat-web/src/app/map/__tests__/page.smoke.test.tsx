import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

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
});
