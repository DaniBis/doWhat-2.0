import { jest } from '@jest/globals';

// Jest setup file that runs before the test framework is installed.
// Ensure Supabase-dependent modules resolve environment config even outside Expo.
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-key';
process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      },
    },
  },
}));
jest.mock('react-native-url-polyfill/auto', () => ({}));

export {};
