import '@testing-library/jest-dom';
import React from 'react';

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
  notFound: jest.fn()
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
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }))
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null }))
  }))
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
