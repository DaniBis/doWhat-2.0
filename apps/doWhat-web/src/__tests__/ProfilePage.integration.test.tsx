import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import ProfilePage from '@/app/profile/page';

jest.mock('next/navigation', () => ({}));

// Mock supabase auth
jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } } }),
    },
  }
}));

// Mock global fetch for profile endpoints & update
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const toHref = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
};

const fetchMock = jest.fn<Promise<Response>, FetchArgs>((url) => {
  const href = toHref(url);
  if (href.startsWith('/api/profile/user-1/update')) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }
  if (href.startsWith('/api/profile/user-1/reliability')) {
    return Promise.resolve(new Response(JSON.stringify({ reliability: { score: 0, confidence: 0, components: { AS30: 0, AS90: 0 } }, attendance: null }), { status: 200 }));
  }
  return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
});

Object.defineProperty(global, 'fetch', { value: fetchMock });

// crypto shim
Object.defineProperty(global, 'crypto', { value: { randomUUID: () => 'uuid-int' } });

// Minimal ResizeObserver polyfill for tests if component uses it later
class RO { observe(){} unobserve(){} disconnect(){} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

// Minimal Response polyfill if not present (Node version variance / JSDOM)
if (!(globalThis as { Response?: typeof Response }).Response) {
  class PolyfilledResponse {
    private readonly _body: string;
    public readonly status: number;
    public readonly headers: HeadersInit;
    constructor(body: string, init?: ResponseInit) {
      this._body = body;
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }
    async json() { return JSON.parse(this._body); }
    get ok() { return this.status >= 200 && this.status < 300; }
    text() { return Promise.resolve(this._body); }
  }
  (globalThis as unknown as { Response: typeof PolyfilledResponse }).Response = PolyfilledResponse;
}

describe('ProfilePage integration basic edit', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it('loads profile and saves new name + socials through update API', async () => {
    // Provide profile GET route specifically
      fetchMock.mockImplementation((url: RequestInfo | URL) => {
        const href = toHref(url);
        if (href === '/api/profile/user-1') {
          return Promise.resolve(new Response(JSON.stringify({ id:'user-1', name:'Orig', email:'u@example.com' }), { status: 200 }));
        }
        if (href.startsWith('/api/profile/user-1/update')) {
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        }
        if (href.startsWith('/api/profile/user-1/reliability')) {
          return Promise.resolve(new Response(JSON.stringify({ reliability: { score: 0, confidence: 0, components: { AS30:0, AS90:0 } }, attendance: null }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      });
    const { getByText, queryByText, getByPlaceholderText } = render(<ProfilePage />);
    await waitFor(() => expect(getByText('Orig')).toBeInTheDocument());
  // Disambiguate the profile header Edit button (the first one near name)
  const editButtons = document.querySelectorAll('button');
  const nameEdit = Array.from(editButtons).find((button) => button.textContent === 'Edit' && button.className.includes('inline-flex')) as HTMLButtonElement | undefined;
  if (!nameEdit) throw new Error('Profile header Edit button not found');
  fireEvent.click(nameEdit);
    const input = getByPlaceholderText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Edited' } });
  // add socials (instagram only supported here)
  const igInput = document.querySelector('input[placeholder="yourgram"]') as HTMLInputElement;
  fireEvent.change(igInput, { target: { value: 'testergram' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profile/user-1/update', expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining('testergram')
      }));
    });
    // Edit modal closes
    await waitFor(() => expect(queryByText('Edit Profile')).not.toBeInTheDocument());
  });
});
