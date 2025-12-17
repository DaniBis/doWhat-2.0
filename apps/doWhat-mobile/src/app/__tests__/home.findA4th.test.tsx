import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

let mockRouterPush: jest.Mock;
const mockUseRankedOpenSessions = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  mockRouterPush = jest.fn();
  return {
    Link: ({ children }: { children: React.ReactElement }) => children,
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => callback(), [callback]);
    },
    router: {
      push: mockRouterPush,
    },
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 44.4268, longitude: 26.1025 } })),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../lib/bg-location', () => ({
  ensureBackgroundLocation: jest.fn(async () => undefined),
  getLastKnownBackgroundLocation: jest.fn(async () => null),
}));

jest.mock('../../lib/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(async () => ({
    ok: true,
    json: async () => ({ activities: [] }),
  })),
}));

jest.mock('../../lib/web', () => ({
  createWebUrl: (path: string) => new URL(`https://example.com${path}`),
}));

jest.mock('../../contexts/SavedActivitiesContext', () => ({
  useSavedActivities: () => ({
    isSaved: () => false,
    pendingIds: new Set<string>(),
    toggle: jest.fn(),
  }),
}));

jest.mock('../../components/Brand', () => () => null);
jest.mock('../../components/ActivityIcon', () => () => null);
jest.mock('../../components/SessionAttendanceBadges', () => () => null);
jest.mock('../../components/SessionAttendanceQuickActions', () => () => null);
jest.mock('../../components/SearchBar', () => () => null);
jest.mock('../../components/EmptyState', () => () => null);
jest.mock('../../components/OnboardingNavPrompt', () => () => null);

const mockFindA4thHero = jest.fn((props: { sessions?: Array<Record<string, unknown>>; onPress?: (session: Record<string, unknown>) => void }) => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return (
    <Text testID="find-a-4th-hero-mock" onPress={() => props.onPress?.(props.sessions?.[0] as Record<string, unknown>)}>
      Find a 4th
    </Text>
  );
});

jest.mock('../../components/FindA4thHero', () => ({
  __esModule: true,
  default: (props: { sessions?: Array<Record<string, unknown>>; onPress?: (session: Record<string, unknown>) => void }) =>
    mockFindA4thHero(props),
}));

jest.mock('../../hooks/useRankedOpenSessions', () => ({
  useRankedOpenSessions: () => mockUseRankedOpenSessions(),
}));

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared');
  return {
    ...actual,
    trackFindA4thImpression: jest.fn(),
    trackFindA4thCardTap: jest.fn(),
    createPlacesFetcher: () => async () => ({ places: [] }),
    getCityConfig: () => ({
      slug: 'test-city',
      center: { lat: 44.4268, lng: 26.1025 },
      defaultRegion: { latitudeDelta: 0.1, longitudeDelta: 0.1 },
    }),
  };
});

const { trackFindA4thImpression: mockTrackFindA4thImpression, trackFindA4thCardTap: mockTrackFindA4thCardTap } =
  jest.requireMock('@dowhat/shared') as {
    trackFindA4thImpression: jest.Mock;
    trackFindA4thCardTap: jest.Mock;
  };

let supabaseTableData: Record<string, unknown> = {
  profiles: null,
  user_sport_profiles: [],
  sessions: [],
};

const buildQueryBuilder = (table: string) => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: supabaseTableData[table] ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: supabaseTableData[table] ?? null, error: null }),
  };
  builder.then = (resolve: (value: { data: unknown; error: null }) => void) =>
    Promise.resolve({ data: supabaseTableData[table] ?? [], error: null }).then(resolve);
  builder.catch = () => builder;
  return builder;
};

const mockSupabaseAuth = jest.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } }));
const mockSupabaseFrom = jest.fn((table: string) => buildQueryBuilder(table));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockSupabaseAuth(),
    },
    from: (table: string) => mockSupabaseFrom(table),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const buildRankedSession = () => ({
  score: 0.87,
  session: {
    id: 'session-123',
    activityName: 'Padel Mix',
    venueName: 'River Courts',
    startsAt: '2025-12-13T15:00:00.000Z',
    openSlotMeta: { slotId: 'slot-1', slotsCount: 2, requiredSkillLevel: null },
    openSlots: { slotsTotal: 2, slotsTaken: 0 },
  },
});

import HomeScreen from '../home';

describe('HomeScreen Find a 4th hero', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRankedOpenSessions.mockReset();
    supabaseTableData = {
      profiles: null,
      user_sport_profiles: [],
      sessions: [],
    };
    mockSupabaseAuth.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('renders the hero when ranked sessions exist', async () => {
    mockUseRankedOpenSessions.mockReturnValue({
      sessions: [buildRankedSession()],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('find-a-4th-hero-mock')).toBeTruthy());
  });

  it('hides the hero when no sessions are available', async () => {
    mockUseRankedOpenSessions.mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    render(<HomeScreen />);

    await waitFor(() => {
      expect(mockFindA4thHero).not.toHaveBeenCalled();
    });
  });

  it('navigates and emits telemetry when a card is tapped', async () => {
    mockUseRankedOpenSessions.mockReturnValue({
      sessions: [buildRankedSession()],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('find-a-4th-hero-mock')).toBeTruthy());

    fireEvent.press(getByTestId('find-a-4th-hero-mock'));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/sessions/session-123');
      expect(mockTrackFindA4thCardTap).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-123', sport: 'Padel Mix', venue: 'River Courts' }),
      );
    });
  });

  it('fires the impression telemetry once per render', async () => {
    mockUseRankedOpenSessions.mockReturnValue({
      sessions: [buildRankedSession()],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    render(<HomeScreen />);

    await waitFor(() => expect(mockTrackFindA4thImpression).toHaveBeenCalledTimes(1));
    expect(mockTrackFindA4thImpression).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [
          expect.objectContaining({ sessionId: 'session-123', sport: 'Padel Mix', venue: 'River Courts' }),
        ],
      }),
    );
  });
});
