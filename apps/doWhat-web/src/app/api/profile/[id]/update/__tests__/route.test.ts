const getUserMock = jest.fn();
const upsertMock = jest.fn();
const fromMock = jest.fn(() => ({ upsert: upsertMock }));
const ensureProfileColumnsMock = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

jest.mock('@/lib/db/ensureProfileColumns', () => ({
  ensureProfileColumns: (...args: unknown[]) => ensureProfileColumnsMock(...args),
}));

let POST: typeof import('../route').POST;

beforeAll(async () => {
  if (!globalThis.TextEncoder || !globalThis.TextDecoder) {
    const { TextEncoder, TextDecoder } = await import('node:util');
    globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
    globalThis.TextDecoder = (globalThis.TextDecoder ?? TextDecoder) as unknown as typeof globalThis.TextDecoder;
  }
  if (!globalThis.ReadableStream) {
    const { ReadableStream } = await import('node:stream/web');
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;
  }
  if (!globalThis.MessagePort || !globalThis.MessageChannel) {
    const { MessagePort, MessageChannel } = await import('node:worker_threads');
    globalThis.MessagePort = (globalThis.MessagePort ?? MessagePort) as unknown as typeof globalThis.MessagePort;
    globalThis.MessageChannel = (globalThis.MessageChannel ?? MessageChannel) as unknown as typeof globalThis.MessageChannel;
  }
  if (!globalThis.Request || !globalThis.Response || !globalThis.Headers) {
    const { Request, Response, Headers } = await import('undici');
    globalThis.Request = (globalThis.Request ?? Request) as unknown as typeof globalThis.Request;
    globalThis.Response = (globalThis.Response ?? Response) as unknown as typeof globalThis.Response;
    globalThis.Headers = (globalThis.Headers ?? Headers) as unknown as typeof globalThis.Headers;
  }
  const route = await import('../route');
  POST = route.POST;
});

describe('/api/profile/[id]/update', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockClear();
    ensureProfileColumnsMock.mockReset();
  });

  test('continues with update when ensureProfileColumns fails due to ENOTFOUND', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    ensureProfileColumnsMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND db.invalid.supabase.co'));
    upsertMock.mockResolvedValue({ error: null });

    const req = new Request('http://localhost/api/profile/user-1/update', {
      method: 'POST',
      body: JSON.stringify({ name: 'Aston' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(req, { params: { id: 'user-1' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('profiles');
  });
});
