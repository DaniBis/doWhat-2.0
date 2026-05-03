const mockExchangeCodeForSession = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock('@/lib/supabase/routeHandler', () => ({
  createRouteHandlerClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

import type { NextRequest } from 'next/server';

let GET: typeof import('../route').GET;

describe('/auth/callback', () => {
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
    GET = route.GET;
  });

  beforeEach(() => {
    mockExchangeCodeForSession.mockReset();
    mockVerifyOtp.mockReset();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
  });

  it('exchanges code and redirects to the requested path on the request origin', async () => {
    const response = await GET(
      new Request('https://preview.example.com/auth/callback?code=abc123&next=%2Fmap%3Fq%3Dchess') as unknown as NextRequest,
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://preview.example.com/map?q=chess');
  });

  it('rejects arbitrary external callback redirects', async () => {
    const response = await GET(
      new Request('https://preview.example.com/auth/callback?code=abc123&next=https%3A%2F%2Fevil.example') as unknown as NextRequest,
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.headers.get('location')).toBe('https://preview.example.com/');
  });

  it('rejects protocol-relative callback redirects', async () => {
    const response = await GET(
      new Request('https://preview.example.com/auth/callback?code=abc123&next=%2F%2Fevil.example') as unknown as NextRequest,
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.headers.get('location')).toBe('https://preview.example.com/');
  });
});
