import { POST } from './route';

jest.mock('next/server', () => {
  const json = jest.fn((body: unknown, init?: ResponseInit) => ({
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    async json() {
      return body;
    },
  }));
  return {
    NextResponse: {
      json,
    },
  };
});

jest.mock('@/lib/supabase/service', () => {
  const createServiceClient = jest.fn();
  return { createServiceClient };
});

jest.mock('@/lib/venues/enrichment', () => {
  const enrichVenueActivities = jest.fn();
  return { enrichVenueActivities };
});

const nextServer = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };
const mockNextResponseJson = nextServer.NextResponse.json;
const mockCreateServiceClient = (jest.requireMock('@/lib/supabase/service') as {
  createServiceClient: jest.Mock;
}).createServiceClient;
const mockEnrichVenueActivities = (jest.requireMock('@/lib/venues/enrichment') as {
  enrichVenueActivities: jest.Mock;
}).enrichVenueActivities;

describe('POST /api/venues/[id]/enrich', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  test('rejects unauthorized requests', async () => {
    const request = buildRequest('http://localhost/api/venues/abc/enrich', { method: 'POST' });

    const response = await POST(request, { params: { id: 'abc' } });
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: 'Unauthorized' });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  test('runs enrichment when secret matches', async () => {
    const supabase = { key: 'service' } as unknown as Record<string, never>;
    mockCreateServiceClient.mockReturnValue(supabase);
    mockEnrichVenueActivities.mockResolvedValue({
      venue: {
        id: 'abc',
        name: 'Dowhat Venue',
        lat: 13.7,
        lng: 100.5,
        raw_description: 'Desc',
        raw_reviews: ['Review'],
        ai_activity_tags: ['climbing'],
        ai_confidence_scores: { climbing: 0.9 },
        verified_activities: ['climbing'],
        last_ai_update: '2025-05-01T00:00:00.000Z',
        needs_verification: false,
        address: null,
        metadata: null,
        created_at: null,
        updated_at: null,
      },
      classification: {
        tags: ['climbing'],
        confidence: { climbing: 0.9 },
        timestamp: '2025-05-01T00:00:00.000Z',
      },
      externalRecord: {
        provider: 'foursquare',
        providerId: 'fsq-1',
        name: 'Dowhat Venue',
        description: 'Desc',
        categories: [],
        keywords: [],
        rating: null,
        priceLevel: null,
        lat: null,
        lng: null,
        photos: [],
        reviews: [],
      },
      providerDiagnostics: ['foursquare:hit'],
      refreshed: true,
    });

    const request = buildRequest('http://localhost/api/venues/abc/enrich', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': 'test-secret',
      },
      body: JSON.stringify({ foursquareId: 'fsq-1', googlePlaceId: 'place-2', force: true }),
    });

    const response = await POST(request, { params: { id: 'abc' } });

    expect(mockCreateServiceClient).toHaveBeenCalledTimes(1);
    expect(mockEnrichVenueActivities).toHaveBeenCalledWith({
      supabase,
      venueId: 'abc',
      foursquareId: 'fsq-1',
      googlePlaceId: 'place-2',
      force: true,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      venue: {
        id: 'abc',
        rawDescription: 'Desc',
        rawReviews: ['Review'],
        aiTags: ['climbing'],
        aiConfidence: { climbing: 0.9 },
        verifiedActivities: ['climbing'],
        lastAiUpdate: '2025-05-01T00:00:00.000Z',
        needsVerification: false,
      },
      classification: {
        tags: ['climbing'],
        confidence: { climbing: 0.9 },
        timestamp: '2025-05-01T00:00:00.000Z',
      },
      externalRecord: {
        provider: 'foursquare',
        providerId: 'fsq-1',
      },
      providerDiagnostics: ['foursquare:hit'],
      refreshed: true,
    });

    expect(mockNextResponseJson).toHaveBeenCalled();
  });
});

type RequestInitLite = { method?: string; headers?: Record<string, string>; body?: string };

function buildRequest(url: string, init?: RequestInitLite): Request {
  const headerMap = new Map<string, string>();
  Object.entries(init?.headers ?? {}).forEach(([key, value]) => {
    headerMap.set(key.toLowerCase(), value);
  });
  const requestLike = {
    url,
    method: init?.method ?? 'GET',
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
    },
    async json() {
      if (!init?.body) return {};
      return JSON.parse(init.body);
    },
  } as Request;
  return requestLike;
}
