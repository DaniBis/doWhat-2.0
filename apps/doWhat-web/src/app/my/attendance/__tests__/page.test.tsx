import React from 'react';
import '@testing-library/jest-dom/jest-globals';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/browser';
import MyAttendancePage from '../page';

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

type AuthGetUserResponse = Awaited<ReturnType<typeof supabase.auth.getUser>>;

const buildAuthResponse = (user: User | null, error: AuthGetUserResponse['error'] = null): AuthGetUserResponse =>
  ({ data: { user }, error }) as AuthGetUserResponse;

const defaultUser = { id: 'user-123' } as User;

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
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
});

const renderPage = () => render(<MyAttendancePage />);

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
});