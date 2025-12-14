import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SessionDetails from '../(tabs)/sessions/[id]';
import type { AttendanceSummary } from '../../lib/sessionAttendance';
import type { AttendanceDisputeHistoryItem } from '../../lib/attendanceDispute';

type SessionAttendanceModule = typeof import('../../lib/sessionAttendance');
type AttendanceDisputeModule = typeof import('../../lib/attendanceDispute');

const baseAttendanceSummary: AttendanceSummary = {
  sessionId: 'session-123',
  userId: 'user-9',
  status: 'going',
  counts: { going: 1, interested: 0, declined: 0, total: 1, verified: 0 },
  maxAttendees: 4,
};

jest.mock('../../lib/sessionAttendance', () => ({
  fetchAttendanceSummary: jest.fn(),
  joinSessionAttendance: jest.fn(),
}));

jest.mock('../../lib/attendanceDispute', () => ({
  fetchAttendanceDisputes: jest.fn(),
  submitAttendanceDispute: jest.fn(),
}));

const sessionAttendanceModule = jest.requireMock('../../lib/sessionAttendance') as {
  fetchAttendanceSummary: jest.MockedFunction<SessionAttendanceModule['fetchAttendanceSummary']>;
  joinSessionAttendance: jest.MockedFunction<SessionAttendanceModule['joinSessionAttendance']>;
};

const attendanceDisputeModule = jest.requireMock('../../lib/attendanceDispute') as {
  fetchAttendanceDisputes: jest.MockedFunction<AttendanceDisputeModule['fetchAttendanceDisputes']>;
  submitAttendanceDispute: jest.MockedFunction<AttendanceDisputeModule['submitAttendanceDispute']>;
};

const mockFetchAttendanceSummary = sessionAttendanceModule.fetchAttendanceSummary;
mockFetchAttendanceSummary.mockResolvedValue(baseAttendanceSummary);

const mockFetchAttendanceDisputes = attendanceDisputeModule.fetchAttendanceDisputes;
mockFetchAttendanceDisputes.mockResolvedValue([]);
const mockSubmitAttendanceDispute = attendanceDisputeModule.submitAttendanceDispute;

jest.mock('../../lib/auth', () => ({
  startGoogleSignIn: jest.fn(),
}));

jest.mock('../../contexts/SavedActivitiesContext', () => ({
  useSavedActivities: () => ({
    isSaved: () => false,
    toggle: jest.fn(),
    pendingIds: new Set<string>(),
  }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'session-123' }),
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared');
  return {
    ...actual,
    trackReliabilityContestOpened: jest.fn(),
    trackReliabilityDisputeHistoryViewed: jest.fn(),
    trackReliabilityDisputeHistoryFailed: jest.fn(),
  };
});

const {
  trackReliabilityContestOpened: trackContestMock,
  trackReliabilityDisputeHistoryViewed: trackHistoryMock,
  trackReliabilityDisputeHistoryFailed: trackHistoryFailMock,
} = jest.requireMock('@dowhat/shared') as {
  trackReliabilityContestOpened: jest.Mock;
  trackReliabilityDisputeHistoryViewed: jest.Mock;
  trackReliabilityDisputeHistoryFailed: jest.Mock;
};

const sessionRow = {
  id: 'session-123',
  activity_id: 'activity-1',
  starts_at: '2025-01-01T10:00:00.000Z',
  ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  price_cents: 1500,
  max_attendees: 8,
  visibility: 'public',
  host_user_id: 'host-1',
  description: null,
  activities: { id: 'activity-1', name: 'Morning Yoga' },
  venues: { id: 'venue-1', name: 'Skyline Studio', address: '123 Main', lat: 0, lng: 0 },
};

const mockSupabaseAuthGetUser = jest.fn(async () => ({ data: { user: { id: 'user-9' } }, error: null }));
const mockSupabaseRemoveChannel = jest.fn();

const buildSessionsQuery = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({ data: sessionRow, error: null }),
    }),
  }),
});

const buildSessionAttendeesQuery = () => ({
  select: () => ({
    eq: () => ({
      in: async () => ({ data: [], error: null }),
    }),
  }),
});

const mockSupabaseFrom = jest.fn((table: string) => {
  if (table === 'sessions') return buildSessionsQuery();
  if (table === 'session_attendees') return buildSessionAttendeesQuery();
  if (table === 'profiles') {
    return {
      select: () => ({
        in: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };
  }
  throw new Error(`Unexpected table ${table}`);
});

type MockRealtimeChannel = {
  on: jest.Mock<MockRealtimeChannel, unknown[]>;
  subscribe: jest.Mock<MockRealtimeChannel, unknown[]>;
};

const buildChannel = (): MockRealtimeChannel => {
  const channel: MockRealtimeChannel = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return channel;
};

const mockSupabaseChannel = jest.fn(() => buildChannel());

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockSupabaseAuthGetUser(),
    },
    from: (table: string) => mockSupabaseFrom(table),
    channel: () => mockSupabaseChannel(),
    removeChannel: (...args: unknown[]) => mockSupabaseRemoveChannel(...args),
  },
}));

describe('SessionDetails reliability contest analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchAttendanceSummary.mockClear();
    mockFetchAttendanceSummary.mockResolvedValue(baseAttendanceSummary);
    mockFetchAttendanceDisputes.mockReset();
    mockFetchAttendanceDisputes.mockResolvedValue([]);
    mockSubmitAttendanceDispute.mockClear();
    mockSupabaseAuthGetUser.mockClear();
    mockSupabaseFrom.mockClear();
    mockSupabaseChannel.mockClear();
    mockSupabaseRemoveChannel.mockClear();
    trackContestMock.mockClear();
    trackHistoryMock.mockClear();
    trackHistoryFailMock.mockClear();
  });

  it('emits analytics when contest CTA is tapped', async () => {
    const { findByText } = render(<SessionDetails />);

    const contestButton = await findByText('Contest reliability');
    fireEvent.press(contestButton);

    await waitFor(() => {
      expect(trackContestMock).toHaveBeenCalledWith({
        platform: 'mobile',
        surface: 'session-detail',
        sessionId: 'session-123',
      });
    });
  });

  const createDispute = (overrides: Partial<AttendanceDisputeHistoryItem> = {}): AttendanceDisputeHistoryItem => {
    const endedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const base: AttendanceDisputeHistoryItem = {
      id: 'dispute-1',
      sessionId: 'session-123',
      status: 'open',
      reason: 'Marked absent incorrectly',
      details: null,
      resolutionNotes: null,
      resolvedAt: null,
      createdAt: endedAt,
      updatedAt: endedAt,
      session: {
        id: 'session-123',
        title: 'Morning Yoga',
        venue: 'Skyline Studio',
        endsAt: endedAt,
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    };
    return {
      ...base,
      ...overrides,
      session: {
        ...base.session,
        ...(overrides.session ?? {}),
      },
    };
  };

  it('tracks dispute history views when the sheet opens', async () => {
    mockFetchAttendanceDisputes.mockResolvedValueOnce([createDispute()]);

    const { findByText } = render(<SessionDetails />);

    await waitFor(() => expect(trackHistoryMock).toHaveBeenCalled());
    trackHistoryMock.mockClear();
    const historyButton = await findByText('View history');
    fireEvent.press(historyButton);

    expect(trackHistoryMock).toHaveBeenCalledWith({
      platform: 'mobile',
      surface: 'session-detail',
      disputes: 1,
      source: 'sheet-open',
    });
  });

  it('emits analytics when the history refresh button is pressed', async () => {
    mockFetchAttendanceDisputes
      .mockResolvedValueOnce([createDispute()])
      .mockResolvedValueOnce([
        createDispute(),
        createDispute({
          id: 'dispute-2',
          sessionId: 'session-456',
          status: 'reviewing',
          session: {
            id: 'session-456',
            title: 'Evening Run',
            venue: 'City Park',
            startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            endsAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          },
        }),
      ]);

    const { findByText } = render(<SessionDetails />);

    await waitFor(() => expect(trackHistoryMock).toHaveBeenCalled());
    trackHistoryMock.mockClear();

    const historyButton = await findByText('View history');
    fireEvent.press(historyButton);

    const refreshButton = await findByText('Refresh');
    fireEvent.press(refreshButton);

    await waitFor(() => {
      expect(trackHistoryMock).toHaveBeenCalledWith({
        platform: 'mobile',
        surface: 'session-detail',
        disputes: 2,
        source: 'manual-refresh',
      });
    });
  });

  it('tracks dispute history failures with source metadata', async () => {
    mockFetchAttendanceDisputes.mockRejectedValueOnce(new Error('Network offline'));

    render(<SessionDetails />);

    await waitFor(() => {
      expect(trackHistoryFailMock).toHaveBeenCalledWith({
        platform: 'mobile',
        surface: 'session-detail',
        source: 'auto-load',
        error: 'Network offline',
      });
    });
  });
});
