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
const participation = {
  attendance_supported: true,
  attendance_source_kind: 'session_attendance',
  first_party_attendance: true,
  rsvp_supported: true,
  verification_supported: true,
  participation_truth_level: 'first_party',
  host_kind: 'session_host',
  organizer_kind: 'dowhat_host',
} as const;

describe('SessionAttendanceQuickActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const emptyCounts: AttendanceCounts = { going: 0, interested: 0, declined: 0, total: 0, verified: 0 };
    mockFetchAttendanceSummary.mockResolvedValue({
      status: null,
      counts: emptyCounts,
      maxAttendees: 10,
      participation,
    } as AttendanceSummary);
    mockJoinSessionAttendance.mockResolvedValue({
      status: 'going',
      counts: { ...emptyCounts, going: 1, total: 1 },
      participation,
    } as AttendanceMutationResult);
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('disables the going button when the session is full', async () => {
    mockFetchAttendanceSummary.mockResolvedValueOnce({
      status: null,
      counts: { going: 5, interested: 1, declined: 0, total: 6, verified: 0 },
      maxAttendees: 5,
      participation,
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

  it('shows an honest unavailable state when attendance is not managed in doWhat', async () => {
    mockFetchAttendanceSummary.mockResolvedValueOnce({
      status: null,
      counts: { going: 0, interested: 0, declined: 0, total: 0, verified: 0 },
      maxAttendees: 10,
      participation: {
        ...participation,
        attendance_supported: false,
        rsvp_supported: false,
        participation_truth_level: 'unavailable',
        attendance_source_kind: 'none',
        first_party_attendance: false,
        verification_supported: false,
        host_kind: 'unknown',
        organizer_kind: 'unknown',
      },
    } as AttendanceSummary);

    const { getByText, queryByText } = render(<SessionAttendanceQuickActions sessionId="session-3" />);

    await waitFor(() => {
      expect(getByText('Attendance is not managed in doWhat for this session.')).toBeTruthy();
    });
    expect(queryByText("I'm going")).toBeTruthy();
    fireEvent.press(getByText("I'm going"));
    await waitFor(() => expect(mockJoinSessionAttendance).not.toHaveBeenCalled());
  });
});
