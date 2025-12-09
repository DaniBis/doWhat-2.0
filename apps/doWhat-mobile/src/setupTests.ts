// Ensure React Native globals exist before importing libraries that rely on them
// __DEV__ is accessed during react-native initialization in some packages
(global as typeof global & { __DEV__?: boolean }).__DEV__ = true;

import '@testing-library/jest-native/extend-expect';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';

// Mock expo modules
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
    Link: ({ children }: { children: ReactNode }) => children,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({ children }: { children: ReactNode }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
