// React Native Version Polyfill
// This file ensures reactNativeVersion is available globally

import { Platform } from 'react-native';

// Use hardcoded version to avoid Metro bundling issues
const RN_VERSION = '0.79.5';

// Polyfill for missing reactNativeVersion
type PlatformLike = typeof Platform & {
  reactNativeVersion?: string | { major: number; minor: number; patch: number; prerelease?: number | null };
  constants?: typeof Platform.constants;
};

const platform = Platform as PlatformLike;

if (!platform.reactNativeVersion) {
  platform.reactNativeVersion = RN_VERSION;
}

// Add to global for HMR client if needed
if (typeof global !== 'undefined') {
  (global as typeof global & { reactNativeVersion?: string }).reactNativeVersion = RN_VERSION;
}

// Make sure Platform constants exist
if (!platform.constants) {
  platform.constants = Platform.constants ?? {};
}

if (!platform.constants.reactNativeVersion) {
  platform.constants.reactNativeVersion = { major: 0, minor: 79, patch: 5 };
}
