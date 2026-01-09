const responseJsonMock = jest.fn((body: unknown, init?: ResponseInit) => ({ body, init }));

const rpcMock = jest.fn();

jest.mock('@/lib/db', () => ({
  db: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}));

import { GET } from '../route';

describe('/api/nearby payload', () => {
  type ResponseJson = (body: unknown, init?: ResponseInit) => unknown;
  type GlobalWithResponse = { Response?: { json?: ResponseJson } };
  const globalWithResponse = globalThis as unknown as GlobalWithResponse;
  const originalResponseJson = globalWithResponse.Response?.json;

  beforeAll(() => {
    if (!globalWithResponse.Response) {
      globalWithResponse.Response = { json: responseJsonMock };
      return;
    }
    globalWithResponse.Response.json = responseJsonMock;
  });

  afterAll(() => {
    if (!globalWithResponse.Response) return;
    if (originalResponseJson) {
      globalWithResponse.Response.json = originalResponseJson;
    } else {
      delete globalWithResponse.Response.json;
    }
  });

  beforeEach(() => {
    responseJsonMock.mockClear();
    rpcMock.mockReset();
  });

  it('always returns a non-empty place_label for activities', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'activity-1',
          name: 'Chess',
          venue: null,
          place_id: null,
          place_label: null,
          lat_out: 1,
          lng_out: 2,
          distance_m: 25,
          activity_types: null,
          tags: null,
          traits: null,
        },
      ],
      error: null,
    });

    const result = await GET({ url: 'http://localhost/api/nearby?lat=1&lng=2&radius=2000&limit=5' } as unknown as Request);

    expect(responseJsonMock).toHaveBeenCalledTimes(1);
    void result;
    const payload = responseJsonMock.mock.calls[0]?.[0] as { activities: Array<{ place_label: string }> };
    expect(payload.activities[0]?.place_label).toBe('Unnamed spot');
  });
});
