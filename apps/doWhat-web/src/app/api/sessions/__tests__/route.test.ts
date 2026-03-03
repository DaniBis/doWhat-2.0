import { POST } from '../route';

const jsonMock = jest.fn();
const revalidatePathMock = jest.fn();
const createServiceClientMock = jest.fn();

const resolveApiUserMock = jest.fn();
const extractSessionPayloadMock = jest.fn();
const resolveSessionPlaceIdMock = jest.fn();
const ensureActivityMock = jest.fn();
const ensureVenueMock = jest.fn();
const deriveSessionPlaceLabelMock = jest.fn();
const hydrateSessionsMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (...args: unknown[]) => jsonMock(...args),
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createServiceClientMock(),
}));

jest.mock('@/lib/sessions/server', () => ({
  resolveApiUser: (...args: unknown[]) => resolveApiUserMock(...args),
  extractSessionPayload: (...args: unknown[]) => extractSessionPayloadMock(...args),
  resolveSessionPlaceId: (...args: unknown[]) => resolveSessionPlaceIdMock(...args),
  ensureActivity: (...args: unknown[]) => ensureActivityMock(...args),
  ensureVenue: (...args: unknown[]) => ensureVenueMock(...args),
  deriveSessionPlaceLabel: (...args: unknown[]) => deriveSessionPlaceLabelMock(...args),
  hydrateSessions: (...args: unknown[]) => hydrateSessionsMock(...args),
  SessionValidationError: class SessionValidationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

type SessionsInsertQuery = {
  select: (...args: unknown[]) => {
    single: () => Promise<{ data: Record<string, unknown>; error: null }>;
  };
};

describe('/api/sessions POST place policy', () => {
  beforeEach(() => {
    jsonMock.mockClear();
    revalidatePathMock.mockClear();
    createServiceClientMock.mockReset();
    resolveApiUserMock.mockReset();
    extractSessionPayloadMock.mockReset();
    resolveSessionPlaceIdMock.mockReset();
    ensureActivityMock.mockReset();
    ensureVenueMock.mockReset();
    deriveSessionPlaceLabelMock.mockReset();
    hydrateSessionsMock.mockReset();
  });

  it('ignores explicit placeId override when an existing activity is selected', async () => {
    const sessionInsert = jest.fn((_: Record<string, unknown>): SessionsInsertQuery => ({
      select: () => ({
        single: async () => ({
          data: {
            id: 'session-1',
            activity_id: '11111111-1111-1111-1111-111111111111',
            venue_id: null,
          },
          error: null,
        }),
      }),
    }));
    const attendeesUpsert = jest.fn(async () => ({ data: null, error: null }));

    createServiceClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'sessions') {
          return { insert: sessionInsert };
        }
        if (table === 'session_attendees') {
          return { upsert: attendeesUpsert };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });

    resolveApiUserMock.mockResolvedValue({ id: 'user-1' });
    extractSessionPayloadMock.mockReturnValue({
      activityId: '11111111-1111-1111-1111-111111111111',
      placeId: '22222222-2222-2222-2222-222222222222',
      venueId: null,
      venueName: 'Payload venue',
      lat: 13.75,
      lng: 100.5,
      startsAt: '2026-03-05T10:00:00.000Z',
      endsAt: '2026-03-05T12:00:00.000Z',
      priceCents: 0,
      maxAttendees: 20,
      visibility: 'public',
      description: null,
    });
    resolveSessionPlaceIdMock.mockResolvedValue('activity-place-id');
    ensureActivityMock.mockResolvedValue('11111111-1111-1111-1111-111111111111');
    ensureVenueMock.mockResolvedValue(null);
    deriveSessionPlaceLabelMock.mockResolvedValue('Canonical place');
    hydrateSessionsMock.mockResolvedValue([{ id: 'session-1' }]);

    await POST(
      {
        json: async () => ({}),
      } as unknown as Request,
    );

    expect(resolveSessionPlaceIdMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activityId: '11111111-1111-1111-1111-111111111111',
      }),
    );

    expect(sessionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        place_id: 'activity-place-id',
        place_label: 'Canonical place',
      }),
    );

    const insertedPayload = sessionInsert.mock.calls[0]?.[0];
    expect(insertedPayload).toBeDefined();
    const insertedRecord = insertedPayload as unknown as Record<string, unknown>;
    expect(insertedRecord.place_id).not.toBe('22222222-2222-2222-2222-222222222222');
  });

  it('uses fallback non-empty place_label for standalone sessions', async () => {
    const sessionInsert = jest.fn((_: Record<string, unknown>): SessionsInsertQuery => ({
      select: () => ({
        single: async () => ({
          data: {
            id: 'session-standalone',
            activity_id: 'activity-standalone',
            venue_id: null,
          },
          error: null,
        }),
      }),
    }));
    const attendeesUpsert = jest.fn(async () => ({ data: null, error: null }));

    createServiceClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'sessions') return { insert: sessionInsert };
        if (table === 'session_attendees') return { upsert: attendeesUpsert };
        throw new Error(`Unexpected table ${table}`);
      },
    });

    resolveApiUserMock.mockResolvedValue({ id: 'user-1' });
    extractSessionPayloadMock.mockReturnValue({
      activityId: null,
      placeId: null,
      venueId: null,
      venueName: null,
      lat: 40.7128,
      lng: -74.006,
      startsAt: '2026-03-05T10:00:00.000Z',
      endsAt: '2026-03-05T12:00:00.000Z',
      priceCents: 0,
      maxAttendees: 20,
      visibility: 'public',
      description: null,
    });
    resolveSessionPlaceIdMock.mockResolvedValue(null);
    ensureActivityMock.mockResolvedValue('activity-standalone');
    ensureVenueMock.mockResolvedValue(null);
    deriveSessionPlaceLabelMock.mockResolvedValue('Unknown location');
    hydrateSessionsMock.mockResolvedValue([{ id: 'session-standalone' }]);

    await POST({ json: async () => ({}) } as unknown as Request);

    expect(sessionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        place_id: null,
        place_label: 'Unknown location',
      }),
    );
  });

  it('rejects sessions when resolved place_label is empty', async () => {
    const sessionInsert = jest.fn((_: Record<string, unknown>): SessionsInsertQuery => ({
      select: () => ({
        single: async () => ({
          data: {
            id: 'session-empty-label',
            activity_id: 'activity-empty-label',
            venue_id: null,
          },
          error: null,
        }),
      }),
    }));

    createServiceClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'sessions') return { insert: sessionInsert };
        if (table === 'session_attendees') return { upsert: jest.fn(async () => ({ data: null, error: null })) };
        throw new Error(`Unexpected table ${table}`);
      },
    });

    resolveApiUserMock.mockResolvedValue({ id: 'user-1' });
    extractSessionPayloadMock.mockReturnValue({
      activityId: null,
      placeId: null,
      venueId: null,
      venueName: null,
      lat: 40.7128,
      lng: -74.006,
      startsAt: '2026-03-05T10:00:00.000Z',
      endsAt: '2026-03-05T12:00:00.000Z',
      priceCents: 0,
      maxAttendees: 20,
      visibility: 'public',
      description: null,
    });
    resolveSessionPlaceIdMock.mockResolvedValue(null);
    ensureActivityMock.mockResolvedValue('activity-empty-label');
    ensureVenueMock.mockResolvedValue(null);
    deriveSessionPlaceLabelMock.mockResolvedValue('   ');

    await POST({ json: async () => ({}) } as unknown as Request);

    const [body, init] = jsonMock.mock.calls.at(-1) as [Record<string, unknown>, { status: number }];
    expect(init.status).toBe(400);
    expect(String(body.error ?? '')).toMatch(/place label/i);
    expect(sessionInsert).not.toHaveBeenCalled();
  });

});
