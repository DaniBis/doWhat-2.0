import { submitAttendanceDispute, fetchAttendanceDisputes } from '../attendanceDispute';
import { trackAttendanceDisputeSubmitted } from '@dowhat/shared';

jest.mock('@dowhat/shared', () => ({
  trackAttendanceDisputeSubmitted: jest.fn(),
}));

describe('attendance dispute helpers', () => {
  const originalFetch = global.fetch;
  const trackSpy = trackAttendanceDisputeSubmitted as jest.Mock;

  beforeEach(() => {
    trackSpy.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('posts dispute payload and resolves JSON', async () => {
    const responsePayload = { id: 'dispute-1', status: 'pending' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => responsePayload,
    });

    const result = await submitAttendanceDispute({
      sessionId: 'session-123',
      reason: 'Marked absent',
      details: 'Checked in with host.',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/disputes'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(trackSpy).toHaveBeenCalledWith({
      platform: 'mobile',
      sessionId: 'session-123',
      hasDetails: true,
      reasonLength: 'Marked absent'.length,
    });
    expect(result).toEqual(responsePayload);
  });

  it('throws when API returns an error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Already disputed' }),
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
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const disputes = await fetchAttendanceDisputes();

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/disputes'), {
      credentials: 'include',
    });
    expect(disputes).toEqual(payload.disputes);
  });

  it('throws when dispute history fails to load', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Auth required' }),
    });

    await expect(fetchAttendanceDisputes()).rejects.toThrow('Auth required');
  });
});
