// Ensure React Native globals exist before importing libraries that rely on them
// __DEV__ is accessed during react-native initialization in some packages
(global as typeof global & { __DEV__?: boolean }).__DEV__ = true;

import '@testing-library/jest-native/extend-expect';
import { jest } from '@jest/globals';

// Mock expo modules
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: 'http://localhost:54321',
        supabaseKey: 'test-key'
      }
    }
  }
}));

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({
    coords: {
      latitude: 37.7749,
      longitude: -122.4194
    }
  }))
}));

// Light-touch mocks only when directly imported in unit tests; avoid overriding react-native.
jest.mock(
  'expo-maps',
  () => ({
    MapView: 'MapView',
  }),
  { virtual: true }
);

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve())
}));

// No-op: __DEV__ is set at the top to avoid early import issues
