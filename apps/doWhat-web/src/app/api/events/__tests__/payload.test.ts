import type { EventSummary } from '@dowhat/shared';

const jsonMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (...args: unknown[]) => jsonMock(...args),
  },
}));

const fromMock = jest.fn();
const createServiceClientMock = jest.fn(() => ({ from: fromMock }));

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import { GET } from '../route';

type QueryResult = { data: unknown; error: { message?: string | null } | null };

type MockQuery = {
  select: (...args: unknown[]) => MockQuery;
  order: (...args: unknown[]) => MockQuery;
  limit: (...args: unknown[]) => MockQuery;
  gte: (...args: unknown[]) => MockQuery;
  lte: (...args: unknown[]) => MockQuery;
  overlaps: (...args: unknown[]) => MockQuery;
  in: (...args: unknown[]) => MockQuery;
  eq: (...args: unknown[]) => MockQuery;
  maybeSingle: (...args: unknown[]) => Promise<QueryResult>;
  single: (...args: unknown[]) => Promise<QueryResult>;
  then: Promise<QueryResult>['then'];
};

const createQuery = (result: QueryResult): MockQuery => {
  const query = {} as MockQuery;
  query.select = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.gte = jest.fn(() => query);
  query.lte = jest.fn(() => query);
  query.overlaps = jest.fn(() => query);
  query.in = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => result);
  query.single = jest.fn(async () => result);
  query.then = ((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)) as Promise<QueryResult>['then'];
  return query;
};

describe('/api/events payload', () => {
  beforeEach(() => {
    jsonMock.mockClear();
    fromMock.mockReset();
    createServiceClientMock.mockClear();
  });

  it('always returns a non-empty place_label for events', async () => {
    const eventRow: EventSummary = {
      id: 'event-1',
      title: 'Forest party',
      description: null,
      start_at: new Date().toISOString(),
      end_at: null,
      timezone: null,
      venue_name: null,
      place_label: null,
      lat: 1,
      lng: 2,
      address: null,
      url: null,
      image_url: null,
      status: 'unverified',
      event_state: null,
      tags: null,
      place_id: null,
      source_id: null,
      source_uid: null,
      metadata: {},
      reliability_score: null,
      verification_confirmations: null,
      verification_required: null,
      place: null,
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return createQuery({ data: [eventRow], error: null });
      if (table === 'sessions') return createQuery({ data: [], error: null });
      if (table === 'places') return createQuery({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    await GET({ url: 'http://localhost/api/events?limit=5' } as unknown as Request);

    expect(jsonMock).toHaveBeenCalledTimes(1);
    const payload = jsonMock.mock.calls[0]?.[0] as { events: EventSummary[] };
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events[0]?.place_label).toBe('Unnamed spot');
  });
});
