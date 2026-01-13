export {};

jest.mock('@/lib/rateLimit', () => ({ rateLimit: () => true }));

jest.mock('@/lib/discovery/engine', () => ({
  discoverNearbyVenues: jest.fn(),
}));

const { discoverNearbyVenues } = jest.requireMock('@/lib/discovery/engine') as { discoverNearbyVenues: jest.Mock };

let GET: typeof import('../route').GET;

beforeAll(async () => {
  if (!globalThis.TextEncoder) {
    const { TextEncoder, TextDecoder } = await import('node:util');
    globalThis.TextEncoder = TextEncoder;
    if (!globalThis.TextDecoder) {
      globalThis.TextDecoder = TextDecoder;
    }
  }
  if (!globalThis.ReadableStream) {
    const { ReadableStream } = await import('node:stream/web');
    globalThis.ReadableStream = ReadableStream;
  }
  if (!globalThis.MessagePort) {
    const { MessagePort, MessageChannel } = await import('node:worker_threads');
    globalThis.MessagePort = MessagePort;
    if (!globalThis.MessageChannel) {
      globalThis.MessageChannel = MessageChannel;
    }
  }
  if (!globalThis.Request) {
    const { Request, Response, Headers } = await import('undici');
    globalThis.Request = Request;
    if (!globalThis.Response) {
      globalThis.Response = Response;
    }
    if (!globalThis.Headers) {
      globalThis.Headers = Headers;
    }
  }
  const route = await import('../route');
  GET = route.GET;
});

describe('/api/search-venues', () => {
  it('returns discovery metadata from the shared engine', async () => {
    const discoverMock = discoverNearbyVenues as jest.Mock;
    discoverMock.mockResolvedValue({
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 2000,
        count: 1,
        items: [
          {
            id: 'venue-1',
            name: 'Chess Cafe',
            venue: 'Main St',
            place_id: null,
            place_label: 'Chess Cafe',
            lat: 1,
            lng: 2,
            distance_m: 0,
            activity_types: ['chess'],
            tags: ['indoor'],
            traits: null,
            source: 'venues',
          },
        ],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: false,
          taxonomyCategories: false,
          priceLevels: false,
          capacityKey: false,
          timeWindow: false,
        },
        facets: {
          activityTypes: [{ value: 'chess', count: 1 }],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: { venues: 1 },
        source: 'venues',
      },
      venues: [
        {
          venueId: 'venue-1',
          venueName: 'Chess Cafe',
          lat: 1,
          lng: 2,
          displayAddress: 'Main St',
          primaryCategories: [],
          rating: null,
          priceLevel: null,
          photoUrl: null,
          openNow: null,
          hoursSummary: null,
          activity: 'chess',
          aiConfidence: 0.9,
          userYesVotes: 0,
          userNoVotes: 0,
          categoryMatch: true,
          keywordMatch: true,
          score: 1,
          verified: false,
          needsVerification: false,
        },
      ],
      debug: { limitApplied: 1, venueCount: 1, voteCount: 0 },
    });

    const request = new Request('http://localhost/api/search-venues?activity=chess&lat=1&lng=2&radius=2000&limit=1');
    const response = await GET(request);
    const payload = await response.json();

    expect(discoverMock).toHaveBeenCalledTimes(1);
    expect(payload.results).toHaveLength(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.sourceBreakdown).toEqual({ venues: 1 });
    expect(payload.filterSupport.activityTypes).toBe(true);
    expect(payload.facets.activityTypes).toEqual([{ value: 'chess', count: 1 }]);
  });
});
