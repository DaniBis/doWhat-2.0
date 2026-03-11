import { PATCH } from '../route';

const jsonMock = jest.fn();
const revalidatePathMock = jest.fn();
const createServiceClientMock = jest.fn();

const resolveApiUserMock = jest.fn();
const extractSessionPayloadMock = jest.fn();
const getSessionOrThrowMock = jest.fn();
const resolveSessionPlaceIdMock = jest.fn();
const deriveSessionPlaceLabelMock = jest.fn();
const ensureActivityMock = jest.fn();
const ensureVenueMock = jest.fn();
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
  getSessionOrThrow: (...args: unknown[]) => getSessionOrThrowMock(...args),
  resolveSessionPlaceId: (...args: unknown[]) => resolveSessionPlaceIdMock(...args),
  deriveSessionPlaceLabel: (...args: unknown[]) => deriveSessionPlaceLabelMock(...args),
  ensureActivity: (...args: unknown[]) => ensureActivityMock(...args),
  ensureVenue: (...args: unknown[]) => ensureVenueMock(...args),
  hydrateSessions: (...args: unknown[]) => hydrateSessionsMock(...args),
  SessionValidationError: class SessionValidationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

type SessionRow = {
  id: string;
  activity_id: string | null;
  venue_id: string | null;
  place_id: string | null;
  host_user_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  max_attendees: number;
  visibility: 'public' | 'friends' | 'private';
  description: string | null;
  place_label: string;
};

type SessionsUpdateQuery = {
  eq: (...args: unknown[]) => {
    select: (...args: unknown[]) => {
      single: () => Promise<{ data: SessionRow; error: null }>;
    };
  };
};

const makeSessionRow = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: overrides.id ?? 'session-1',
  activity_id: overrides.activity_id ?? 'activity-1',
  venue_id: overrides.venue_id ?? null,
  place_id: overrides.place_id ?? null,
  host_user_id: overrides.host_user_id ?? 'user-1',
  starts_at: overrides.starts_at ?? '2026-03-10T10:00:00.000Z',
  ends_at: overrides.ends_at ?? '2026-03-10T11:00:00.000Z',
  price_cents: overrides.price_cents ?? 0,
  max_attendees: overrides.max_attendees ?? 12,
  visibility: overrides.visibility ?? 'public',
  description: overrides.description ?? null,
  place_label: overrides.place_label ?? 'Unknown location',
});

describe('/api/sessions/[sessionId] PATCH place truth', () => {
  beforeEach(() => {
    jsonMock.mockClear();
    revalidatePathMock.mockClear();
    createServiceClientMock.mockReset();
    resolveApiUserMock.mockReset();
    extractSessionPayloadMock.mockReset();
    getSessionOrThrowMock.mockReset();
    resolveSessionPlaceIdMock.mockReset();
    deriveSessionPlaceLabelMock.mockReset();
    ensureActivityMock.mockReset();
    ensureVenueMock.mockReset();
    hydrateSessionsMock.mockReset();
  });

  it('re-derives canonical place_id and place_label together when coords resolve a place', async () => {
    const current = makeSessionRow();
    const updated = makeSessionRow({ place_id: 'place-1', place_label: 'Central Court' });
    const updateMock = jest.fn((_payload: Record<string, unknown>): SessionsUpdateQuery => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: updated, error: null }),
        }),
      }),
    }));

    createServiceClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'sessions') return { update: updateMock };
        throw new Error(`Unexpected table ${table}`);
      },
    });

    resolveApiUserMock.mockResolvedValue({ id: 'user-1' });
    getSessionOrThrowMock.mockResolvedValue(current);
    extractSessionPayloadMock.mockReturnValue({
      lat: 44.43,
      lng: 26.1,
    });
    resolveSessionPlaceIdMock.mockResolvedValue('place-1');
    deriveSessionPlaceLabelMock.mockResolvedValue('Central Court');
    hydrateSessionsMock.mockResolvedValue([{ id: 'session-1', placeId: 'place-1', placeLabel: 'Central Court' }]);

    await PATCH({ json: async () => ({}) } as unknown as Request, { params: { sessionId: 'session-1' } });

    expect(resolveSessionPlaceIdMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activityId: 'activity-1',
        lat: 44.43,
        lng: 26.1,
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        place_id: 'place-1',
        place_label: 'Central Court',
      }),
    );
  });

  it('clears legacy venue linkage when a canonical place-backed update no longer needs venue materialization', async () => {
    const current = makeSessionRow({ venue_id: 'legacy-venue-1', place_label: 'Old Hall' });
    const updated = makeSessionRow({
      venue_id: null,
      place_id: 'place-2',
      place_label: 'Downtown Court',
    });
    const updateMock = jest.fn((_payload: Record<string, unknown>): SessionsUpdateQuery => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: updated, error: null }),
        }),
      }),
    }));

    createServiceClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'sessions') return { update: updateMock };
        throw new Error(`Unexpected table ${table}`);
      },
    });

    resolveApiUserMock.mockResolvedValue({ id: 'user-1' });
    getSessionOrThrowMock.mockResolvedValue(current);
    extractSessionPayloadMock.mockReturnValue({
      lat: 44.43,
      lng: 26.1,
      venueName: 'Old Hall',
    });
    resolveSessionPlaceIdMock.mockResolvedValue('place-2');
    deriveSessionPlaceLabelMock.mockResolvedValue('Downtown Court');
    hydrateSessionsMock.mockResolvedValue([{ id: 'session-1', placeId: 'place-2', placeLabel: 'Downtown Court' }]);

    await PATCH({ json: async () => ({}) } as unknown as Request, { params: { sessionId: 'session-1' } });

    expect(ensureVenueMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        place_id: 'place-2',
        place_label: 'Downtown Court',
        venue_id: null,
      }),
    );
  });
});
