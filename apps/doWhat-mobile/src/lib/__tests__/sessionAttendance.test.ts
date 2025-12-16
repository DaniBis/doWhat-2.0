import {
  fetchAttendanceSummary,
  joinSessionAttendance,
  leaveSessionAttendance,
} from '../sessionAttendance';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('session attendance helpers', () => {
  const invokeMock = supabase.functions.invoke as jest.Mock;
  const sessionMock = supabase.auth.getSession as jest.Mock;

  beforeEach(() => {
    invokeMock.mockReset();
    sessionMock.mockReset();
    sessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } } });
  });

  it('fetches attendance summary via edge function', async () => {
    const payload = {
      sessionId: 'session-1',
      userId: 'user-1',
      status: 'going',
      counts: { going: 1, interested: 2, declined: 0, total: 3, verified: 1 },
      maxAttendees: 10,
    };
    invokeMock.mockResolvedValue({ data: payload, error: null });

    const result = await fetchAttendanceSummary('session-1');

    expect(invokeMock).toHaveBeenCalledWith('mobile-session-attendance', {
      body: { action: 'summary', sessionId: 'session-1' },
    });
    expect(result).toEqual(payload);
  });

  it('joins attendance after ensuring auth', async () => {
    const response = {
      sessionId: 'session-1',
      userId: 'user-1',
      status: 'going',
      previousStatus: null,
      counts: { going: 1, interested: 0, declined: 0, total: 1, verified: 0 },
    };
    invokeMock.mockResolvedValue({ data: response, error: null });

    const result = await joinSessionAttendance('session-1', 'going');

    expect(sessionMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('mobile-session-attendance', {
      body: { action: 'join', sessionId: 'session-1', status: 'going' },
    });
    expect(result).toEqual(response);
  });

  it('throws when joining without a session token', async () => {
    sessionMock.mockResolvedValue({ data: { session: null } });

    await expect(joinSessionAttendance('session-1', 'going')).rejects.toThrow('Please sign in first.');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('leaves attendance via edge function', async () => {
    const response = {
      sessionId: 'session-1',
      userId: 'user-1',
      status: null,
      previousStatus: 'going',
      counts: { going: 0, interested: 0, declined: 0, total: 0, verified: 0 },
    };
    invokeMock.mockResolvedValue({ data: response, error: null });

    const result = await leaveSessionAttendance('session-1');

    expect(invokeMock).toHaveBeenCalledWith('mobile-session-attendance', {
      body: { action: 'leave', sessionId: 'session-1' },
    });
    expect(result).toEqual(response);
  });

  it('surfaces function errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Session is full.' } });

    await expect(joinSessionAttendance('session-1', 'going')).rejects.toThrow('Session is full.');
  });
});
