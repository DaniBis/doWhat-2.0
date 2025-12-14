import React from 'react';
import '@testing-library/jest-dom/jest-globals';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/browser';

const trackDisputeMock = jest.fn();
const trackContestMock = jest.fn();
const trackHistoryMock = jest.fn();
const trackHistoryFailMock = jest.fn();

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual<typeof import('@dowhat/shared')>('@dowhat/shared');
  return {
    __esModule: true,
    ...actual,
    trackAttendanceDisputeSubmitted: trackDisputeMock,
    trackReliabilityContestOpened: trackContestMock,
    trackReliabilityDisputeHistoryViewed: trackHistoryMock,
    trackReliabilityDisputeHistoryFailed: trackHistoryFailMock,
  };
});

let MyAttendancePage: (typeof import('../page'))['default'];

type SessionStatus = 'going' | 'interested' | 'declined';

type SessionAttendeeRow = {
  session_id: string;
  status: SessionStatus;
  sessions: {
    id: string;
    starts_at: string | null;
    ends_at: string | null;
    price_cents: number | null;
    activities?: { name?: string | null } | null;
    venues?: { name?: string | null } | null;
  } | null;
};

type SessionAttendeesOrder = jest.MockedFunction<
  (column: string, options?: unknown) => Promise<{ data: SessionAttendeeRow[]; error: { message: string } | null }>
>;

type SessionAttendeesSelectChain = {
  eq: jest.MockedFunction<(column: string, value: string) => { order: SessionAttendeesOrder }>;
};

type SessionAttendeesTable = {
  select: jest.MockedFunction<() => SessionAttendeesSelectChain>;
  upsert: jest.MockedFunction<
    (payload: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  >;
};

let selectRows: SessionAttendeeRow[] = [];
let selectError: { message: string } | null = null;
let upsertError: { message: string } | null = null;

const sessionAttendeesTable: SessionAttendeesTable = {
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      order: jest.fn(async () => ({ data: selectRows, error: selectError })) as SessionAttendeesOrder,
    })),
  })),
  upsert: jest.fn(async () => ({ error: upsertError })),
};

const authGetUserSpy = jest.spyOn(supabase.auth, 'getUser');
const fromSpy = jest.spyOn(supabase, 'from');
if (typeof global.fetch !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = jest.fn();
}
const fetchSpy = jest.spyOn(global, 'fetch');

type AuthGetUserResponse = Awaited<ReturnType<typeof supabase.auth.getUser>>;

const buildAuthResponse = (user: User | null, error: AuthGetUserResponse['error'] = null): AuthGetUserResponse =>
  ({ data: { user }, error }) as AuthGetUserResponse;

const defaultUser = { id: 'user-123' } as User;

afterAll(() => {
  jest.restoreAllMocks();
});

beforeAll(async () => {
  ({ default: MyAttendancePage } = await import('../page'));
});

beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy.mockReset();
  trackContestMock.mockClear();
  trackHistoryMock.mockClear();
  trackHistoryFailMock.mockClear();
  selectRows = [];
  selectError = null;
  upsertError = null;

  authGetUserSpy.mockImplementation(async () => buildAuthResponse(defaultUser));
  fromSpy.mockImplementation((table: string) => {
    if (table !== 'session_attendees') {
      throw new Error(`Unexpected table ${table}`);
    }
    return sessionAttendeesTable as unknown as ReturnType<typeof supabase.from>;
  });
  fetchSpy.mockImplementation(async (_input: unknown, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({ id: 'dispute-new', status: 'open' }),
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ disputes: [] }),
    } as unknown as Response;
  });
});

const renderPage = () => {
  if (!MyAttendancePage) throw new Error('MyAttendancePage not loaded');
  return render(<MyAttendancePage />);
};

describe('MyAttendancePage', () => {
  it('prompts users to sign in when auth fails', async () => {
    authGetUserSpy.mockResolvedValueOnce(
      buildAuthResponse(null, { message: 'Not signed in' } as AuthGetUserResponse['error']),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Please sign in to see your attendance history.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('renders rows returned by Supabase', async () => {
    selectRows = [
      {
        session_id: 'session-1',
        status: 'going',
        sessions: {
          id: 'session-1',
          starts_at: '2025-01-01T10:00:00.000Z',
          ends_at: null,
          price_cents: 1000,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Morning Yoga')).toBeInTheDocument();
    });
    expect(screen.getByText('Skyline Studio')).toBeInTheDocument();
    expect(screen.getByText(/Status:/)).toHaveTextContent('Status: going');
  });

  it('renders dispute history items from the API', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fetchSpy.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        disputes: [
          {
            id: 'dispute-1',
            sessionId: 'session-1',
            status: 'open',
            reason: 'Marked absent incorrectly',
            details: 'Checked in with front desk.',
            resolutionNotes: null,
            resolvedAt: null,
            createdAt: past,
            updatedAt: past,
            session: {
              id: 'session-1',
              title: 'Morning Yoga',
              venue: 'Skyline Studio',
              endsAt: past,
              startsAt: past,
            },
          },
        ],
      }),
    }) as unknown as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dispute history')).toBeInTheDocument();
      expect(screen.getByText('Marked absent incorrectly')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
    });
  });

  it('tracks dispute history views when payload loads', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fetchSpy.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        disputes: [
          {
            id: 'dispute-1',
            sessionId: 'session-1',
            status: 'open',
            reason: 'Marked absent incorrectly',
            details: null,
            resolutionNotes: null,
            resolvedAt: null,
            createdAt: past,
            updatedAt: past,
            session: {
              id: 'session-1',
              title: 'Morning Yoga',
              venue: 'Skyline Studio',
              endsAt: past,
              startsAt: past,
            },
          },
        ],
      }),
    }) as unknown as Response);

    renderPage();

    await waitFor(() => {
      expect(trackHistoryMock).toHaveBeenCalledWith({
        platform: 'web',
        surface: 'my-attendance',
        disputes: 1,
        source: 'auto-load',
      });
    });
  });

  it('tracks manual refresh events with dispute counts', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fetchSpy
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ disputes: [] }),
      }) as unknown as Response)
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          disputes: [
            {
              id: 'dispute-1',
              sessionId: 'session-1',
              status: 'open',
              reason: 'Marked absent incorrectly',
              details: null,
              resolutionNotes: null,
              resolvedAt: null,
              createdAt: past,
              updatedAt: past,
              session: {
                id: 'session-1',
                title: 'Morning Yoga',
                venue: 'Skyline Studio',
                endsAt: past,
                startsAt: past,
              },
            },
            {
              id: 'dispute-2',
              sessionId: 'session-2',
              status: 'open',
              reason: 'Host marked me absent again',
              details: null,
              resolutionNotes: null,
              resolvedAt: null,
              createdAt: past,
              updatedAt: past,
              session: {
                id: 'session-2',
                title: 'Evening Run',
                venue: 'City Park',
                endsAt: past,
                startsAt: past,
              },
            },
          ],
        }),
      }) as unknown as Response);

    renderPage();

    await waitFor(() => expect(trackHistoryMock).toHaveBeenCalled());
    trackHistoryMock.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(trackHistoryMock).toHaveBeenCalledWith({
        platform: 'web',
        surface: 'my-attendance',
        disputes: 2,
        source: 'manual-refresh',
      });
    });
  });

  it('tracks dispute history fetch failures', async () => {
    fetchSpy.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({ error: 'Auth required' }),
    }) as unknown as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Auth required')).toBeInTheDocument();
      expect(trackHistoryFailMock).toHaveBeenCalledWith({
        platform: 'web',
        surface: 'my-attendance',
        source: 'auto-load',
        error: 'Auth required',
      });
    });
  });

  it('disables the contest button when a dispute already exists', async () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    fetchSpy.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        disputes: [
          {
            id: 'dispute-1',
            sessionId: 'session-1',
            status: 'open',
            reason: 'Host marked me absent',
            details: null,
            resolutionNotes: null,
            resolvedAt: null,
            createdAt: past,
            updatedAt: past,
            session: {
              id: 'session-1',
              title: 'Morning Yoga',
              venue: 'Skyline Studio',
              endsAt: past,
              startsAt: past,
            },
          },
        ],
      }),
    }) as unknown as Response);
    selectRows = [
      {
        session_id: 'session-1',
        status: 'going',
        sessions: {
          id: 'session-1',
          starts_at: past,
          ends_at: past,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Morning Yoga')[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Report submitted' })).toBeDisabled();
    });

    const sessionCard = screen.getAllByText('Morning Yoga')[0].closest('li');
    expect(sessionCard).not.toBeNull();
    if (sessionCard) {
      expect(within(sessionCard).getByText('Dispute status:')).toBeInTheDocument();
    }
  });

  it('updates status optimistically via the upsert handler', async () => {
    selectRows = [
      {
        session_id: 'session-1',
        status: 'interested',
        sessions: {
          id: 'session-1',
          starts_at: '2025-01-01T10:00:00.000Z',
          ends_at: null,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];

    renderPage();
    await waitFor(() => expect(screen.getByText(/Status:/)).toHaveTextContent('Status: interested'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Going' }));

    expect(sessionAttendeesTable.upsert).toHaveBeenCalledWith(
      {
        session_id: 'session-1',
        user_id: 'user-123',
        status: 'going',
      },
      { onConflict: 'session_id,user_id' },
    );
    await waitFor(() => expect(screen.getByText(/Status:/)).toHaveTextContent('Status: going'));
  });

  it('surfaces query errors from Supabase', async () => {
    selectError = { message: 'database offline' };

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('database offline')).toBeInTheDocument();
    });
    expect(screen.queryByText('You have no attendance history yet.')).not.toBeInTheDocument();
  });

  it('shows an error if upsert fails during status updates', async () => {
    selectRows = [
      {
        session_id: 'session-1',
        status: 'interested',
        sessions: {
          id: 'session-1',
          starts_at: null,
          ends_at: null,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];
    upsertError = { message: 'failed to save' };

    renderPage();
    await waitFor(() => expect(screen.getByText(/Status:/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Going' }));

    await waitFor(() => {
      expect(screen.getByText('failed to save')).toBeInTheDocument();
    });
  });

  it('submits a dispute and tracks analytics', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    selectRows = [
      {
        session_id: 'session-1',
        status: 'going',
        sessions: {
          id: 'session-1',
          starts_at: past,
          ends_at: past,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];
    fetchSpy
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ disputes: [] }),
      }) as unknown as Response)
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ id: 'dispute-1', status: 'pending' }),
      }) as unknown as Response)
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          disputes: [
            {
              id: 'dispute-1',
              sessionId: 'session-1',
              status: 'open',
              reason: 'Host marked me absent',
              details: 'Checked in with the host and shared photos in group chat.',
              resolutionNotes: null,
              resolvedAt: null,
              createdAt: past,
              updatedAt: past,
              session: {
                id: 'session-1',
                title: 'Morning Yoga',
                venue: 'Skyline Studio',
                endsAt: past,
                startsAt: past,
              },
            },
          ],
        }),
      }) as unknown as Response);

    renderPage();
    await waitFor(() => expect(screen.getByText('Morning Yoga')).toBeInTheDocument());
    trackHistoryMock.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Contest reliability' }));
    await user.type(screen.getByLabelText('Reason'), 'Host marked me absent');
    await user.type(
      screen.getByLabelText(/Details/i),
      'Checked in with the host and shared photos in group chat.'
    );
    await user.click(screen.getByRole('button', { name: 'Submit dispute' }));

    await waitFor(() => expect(screen.getByText(/Thanks!/i)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/disputes',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(trackDisputeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'web',
        sessionId: 'session-1',
        hasDetails: true,
      })
    );
    expect(screen.getByRole('button', { name: 'Report submitted' })).toBeDisabled();
    expect(trackHistoryMock).toHaveBeenCalledWith({
      platform: 'web',
      surface: 'my-attendance',
      disputes: 1,
      source: 'post-submit',
    });
  });

  it('tracks analytics when the contest modal opens', async () => {
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    selectRows = [
      {
        session_id: 'session-1',
        status: 'going',
        sessions: {
          id: 'session-1',
          starts_at: past,
          ends_at: past,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];

    renderPage();
    await waitFor(() => expect(screen.getByText('Morning Yoga')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Contest reliability' }));

    expect(trackContestMock).toHaveBeenCalledWith({
      platform: 'web',
      surface: 'my-attendance',
      sessionId: 'session-1',
    });
  });

  it('surfaces dispute API errors', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    selectRows = [
      {
        session_id: 'session-1',
        status: 'going',
        sessions: {
          id: 'session-1',
          starts_at: past,
          ends_at: past,
          price_cents: null,
          activities: { name: 'Morning Yoga' },
          venues: { name: 'Skyline Studio' },
        },
      },
    ];
    fetchSpy
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ disputes: [] }),
      }) as unknown as Response)
      .mockImplementationOnce(async () => ({
        ok: false,
        json: async () => ({ error: 'You already have a dispute for this session.' }),
      }) as unknown as Response);

    renderPage();
    await waitFor(() => expect(screen.getByText('Morning Yoga')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Contest reliability' }));
    await user.type(screen.getByLabelText('Reason'), 'Host marked me absent');
    await user.click(screen.getByRole('button', { name: 'Submit dispute' }));

    await waitFor(() =>
      expect(screen.getByText('You already have a dispute for this session.')).toBeInTheDocument()
    );
    expect(trackDisputeMock).not.toHaveBeenCalled();
  });
});