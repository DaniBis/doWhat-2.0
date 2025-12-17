import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import SessionAttendanceQuickActions from '../SessionAttendanceQuickActions';
import {
  fetchAttendanceSummary,
  joinSessionAttendance,
  type AttendanceCounts,
  type AttendanceMutationResult,
  type AttendanceSummary,
} from '../../lib/sessionAttendance';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/sessionAttendance', () => ({
  fetchAttendanceSummary: jest.fn(),
  joinSessionAttendance: jest.fn(),
}));

jest.mock('../../lib/auth', () => ({
  startGoogleSignIn: jest.fn(),
}));

jest.mock('../../lib/supabase', () => {
  const unsubscribe = jest.fn();
  const channel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(() => ({ id: 'channel-id' })),
  };
  return {
    supabase: {
      auth: {
        getUser: jest.fn(),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe } } })),
      },
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(),
    },
  };
});

type MockSupabase = {
  auth: {
    getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string } } }>>;
    onAuthStateChange: jest.Mock;
  };
  channel: jest.Mock;
  removeChannel: jest.Mock;
};

const mockFetchAttendanceSummary = fetchAttendanceSummary as jest.MockedFunction<typeof fetchAttendanceSummary>;
const mockJoinSessionAttendance = joinSessionAttendance as jest.MockedFunction<typeof joinSessionAttendance>;
const mockSupabase = supabase as unknown as MockSupabase;

describe('SessionAttendanceQuickActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const emptyCounts: AttendanceCounts = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };
    mockFetchAttendanceSummary.mockResolvedValue({
      status: null,
      counts: emptyCounts,
      maxAttendees: 10,
    } as AttendanceSummary);
    mockJoinSessionAttendance.mockResolvedValue({ status: 'going', counts: { ...emptyCounts, going: 1, total: 1 } } as AttendanceMutationResult);
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('disables the going button when the session is full', async () => {
    mockFetchAttendanceSummary.mockResolvedValueOnce({
      status: null,
      counts: { going: 5, interested: 1, declined: 0, total: 6, verified: 0 },
      maxAttendees: 5,
    } as AttendanceSummary);

    const { getByText } = render(<SessionAttendanceQuickActions sessionId="session-1" />);

    await waitFor(() => {
      expect(mockFetchAttendanceSummary).toHaveBeenCalledWith('session-1');
      expect(getByText('Full')).toBeTruthy();
    });
  });

  it('submits going status and shows a success message', async () => {
    const { getByText } = render(<SessionAttendanceQuickActions sessionId="session-2" />);

    const goingButton = await waitFor(() => getByText("I'm going"));
    fireEvent.press(goingButton);

    await waitFor(() => {
      expect(mockJoinSessionAttendance).toHaveBeenCalledWith('session-2', 'going');
      expect(getByText("You're going!")).toBeTruthy();
    });
  });
});
