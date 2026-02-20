jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { GET } from '../route';
import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const createRequest = (url: string) => ({ url } as unknown as Request);

describe('/api/admin/discovery-exposures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'ops@example.com';
  });

  it('rejects non-admin users', async () => {
    mockCreateClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'viewer@example.com' } },
          error: null,
        }),
      },
    } as never);

    const response = await GET(createRequest('http://app.local/api/admin/discovery-exposures'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Not authorized' });
  });

  it('returns aggregated exposure metrics for admins', async () => {
    const limitMock = jest.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-02-20T10:11:00.000Z',
          result: {
            source: 'postgis',
            degraded: false,
            cache: { hit: true },
            count: 12,
            debug: {
              candidateCounts: { afterConfidenceGate: 15 },
              dropped: { notPlaceBacked: 2, lowConfidence: 1, deduped: 1 },
            },
            topItems: [{ rankScore: 0.93 }],
          },
        },
        {
          created_at: '2026-02-20T10:42:00.000Z',
          result: {
            source: 'activities',
            degraded: true,
            cache: { hit: false },
            count: 8,
            debug: {
              candidateCounts: { afterConfidenceGate: 10 },
              dropped: { notPlaceBacked: 1, lowConfidence: 2, deduped: 0 },
            },
            topItems: [{ rankScore: 0.71 }],
          },
        },
      ],
      error: null,
    });

    const orderMock = jest.fn(() => ({ limit: limitMock }));
    const gteMock = jest.fn(() => ({ order: orderMock }));
    const selectMock = jest.fn(() => ({ gte: gteMock }));

    mockCreateClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'admin-1', email: 'ops@example.com' } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => {
        if (table !== 'discovery_exposures') throw new Error(`Unexpected table ${table}`);
        return { select: selectMock };
      }),
    } as never);

    const response = await GET(createRequest('http://app.local/api/admin/discovery-exposures?days=7&limit=2000'));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      summary: {
        cacheHitRate: number;
        degradedRate: number;
        avgReturnedItems: number;
        avgAfterConfidenceGate: number;
        droppedNotPlaceBacked: number;
        droppedLowConfidence: number;
        droppedDeduped: number;
        avgTopRankScore: number | null;
      };
      topSources: Array<{ source: string; count: number }>;
      timeseries: Array<{ hourIso: string; count: number }>;
    };

    expect(payload.summary.cacheHitRate).toBe(0.5);
    expect(payload.summary.degradedRate).toBe(0.5);
    expect(payload.summary.avgReturnedItems).toBe(10);
    expect(payload.summary.avgAfterConfidenceGate).toBe(12.5);
    expect(payload.summary.droppedNotPlaceBacked).toBe(3);
    expect(payload.summary.droppedLowConfidence).toBe(3);
    expect(payload.summary.droppedDeduped).toBe(1);
    expect(payload.summary.avgTopRankScore).toBe(0.82);

    expect(payload.topSources).toEqual([
      { source: 'activities', count: 1 },
      { source: 'postgis', count: 1 },
    ]);

    expect(payload.timeseries).toEqual([{ hourIso: '2026-02-20T10:00:00.000Z', count: 2 }]);

    expect(selectMock).toHaveBeenCalledWith('created_at,query,result');
    expect(gteMock).toHaveBeenCalledWith('created_at', expect.any(String));
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(2000);
  });
});
