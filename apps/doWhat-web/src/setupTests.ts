import '@testing-library/jest-dom';
import React from 'react';

process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

const createMockSupabaseQuery = () => {
  const builder: Record<string, unknown> = {};
  builder.select = jest.fn(() => builder);
  builder.insert = jest.fn(() => builder);
  builder.update = jest.fn(() => builder);
  builder.upsert = jest.fn(() => builder);
  builder.delete = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.in = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  builder.single = jest.fn(async () => ({ data: null, error: null }));
  builder.then = jest.fn(() => Promise.resolve({ data: [], error: null }));
  return builder;
};

const createMockSupabaseClient = () => ({
  auth: {
    getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    signInWithOAuth: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
  from: jest.fn(() => createMockSupabaseQuery()),
  rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(async () => ({ data: null, error: null })),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/avatar.png' } })),
    })),
  },
});

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn()
  }),
  useSearchParams: () => ({
    get: jest.fn(),
    getAll: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    values: jest.fn(),
    entries: jest.fn(),
    forEach: jest.fn(),
    toString: jest.fn()
  }),
  usePathname: () => '/',
  notFound: jest.fn(),
  redirect: jest.fn()
}));

jest.mock('next/headers', () => ({
  cookies: () => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }),
  headers: () => ({
    get: jest.fn()
  })
}));

// Mock Mapbox & react-map-gl to avoid WebGL usage in tests
jest.mock('mapbox-gl', () => ({
  Map: jest.fn(() => ({
    addControl: jest.fn(),
    remove: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    getCenter: jest.fn(() => ({ lat: 0, lng: 0 })),
    getBounds: jest.fn(() => ({
      getNorthEast: () => ({ lat: 0, lng: 0 }),
      getSouthWest: () => ({ lat: 0, lng: 0 })
    })),
    getZoom: jest.fn(() => 12),
    getSource: jest.fn(() => ({
      getClusterExpansionZoom: jest.fn((_, cb) => cb(null, 14))
    }))
  })),
  NavigationControl: jest.fn(),
  supported: jest.fn(() => true),
  accessToken: ''
}));

jest.mock('react-map-gl', () => {
  const Mock = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'mapbox-mock' }, children);
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    __esModule: true,
    default: Mock,
    Map: Mock,
    Marker: passthrough,
    NavigationControl: () => React.createElement('div', { 'data-testid': 'navigation-control' }),
    Popup: passthrough,
    Source: passthrough,
    Layer: () => null,
  };
});

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => createMockSupabaseClient()),
}));

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => createMockSupabaseClient()),
  createServerClient: jest.fn(() => createMockSupabaseClient()),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

// Mock IntersectionObserver
(global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Mock ResizeObserver
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};
