import { submitAttendanceDispute, fetchAttendanceDisputes } from '../attendanceDispute';
import { supabase } from '../supabase';
import { trackAttendanceDisputeSubmitted } from '@dowhat/shared';

jest.mock('@dowhat/shared', () => ({
  trackAttendanceDisputeSubmitted: jest.fn(),
}));

jest.mock('../supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('attendance dispute helpers', () => {
  const trackSpy = trackAttendanceDisputeSubmitted as jest.Mock;
  const invokeMock = supabase.functions.invoke as jest.Mock;

  beforeEach(() => {
    trackSpy.mockReset();
    invokeMock.mockReset();
  });

  it('posts dispute payload and resolves JSON', async () => {
    const responsePayload = { id: 'dispute-1', status: 'pending', createdAt: '2024-05-01T12:00:00.000Z' };
    invokeMock.mockResolvedValue({
      data: responsePayload,
      error: null,
    });

    const result = await submitAttendanceDispute({
      sessionId: 'session-123',
      reason: 'Marked absent',
      details: 'Checked in with host.',
    });

    expect(invokeMock).toHaveBeenCalledWith('mobile-disputes', {
      body: {
        action: 'submit',
        sessionId: 'session-123',
        reason: 'Marked absent',
        details: 'Checked in with host.',
      },
    });
    expect(trackSpy).toHaveBeenCalledWith({
      platform: 'mobile',
      sessionId: 'session-123',
      hasDetails: true,
      reasonLength: 'Marked absent'.length,
    });
    expect(result).toEqual(responsePayload);
  });

  it('throws when API returns an error', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Already disputed' },
    });

    await expect(
      submitAttendanceDispute({ sessionId: 'session-123', reason: 'Late mark' }),
    ).rejects.toThrow('Already disputed');
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('fetches dispute history payloads', async () => {
    const payload = {
      disputes: [
        {
          id: 'dispute-1',
          sessionId: 'session-1',
          status: 'open',
          reason: 'Marked absent',
          details: 'Was at venue',
          resolutionNotes: null,
          resolvedAt: null,
          createdAt: '2024-05-01T12:00:00.000Z',
          updatedAt: '2024-05-01T12:05:00.000Z',
          session: {
            id: 'session-1',
            title: 'Morning Yoga',
            venue: 'Community Center',
            endsAt: '2024-05-01T11:00:00.000Z',
            startsAt: '2024-05-01T10:00:00.000Z',
          },
        },
      ],
    };
    invokeMock.mockResolvedValue({
      data: payload,
      error: null,
    });

    const disputes = await fetchAttendanceDisputes();

    expect(invokeMock).toHaveBeenCalledWith('mobile-disputes', {
      body: { action: 'list' },
    });
    expect(disputes).toEqual(payload.disputes);
  });

  it('throws when dispute history fails to load', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Auth required' },
    });

    await expect(fetchAttendanceDisputes()).rejects.toThrow('Auth required');
  });
});
