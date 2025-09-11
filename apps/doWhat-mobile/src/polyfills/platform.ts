// React Native Version Polyfill
// This file ensures reactNativeVersion is available globally

import { Platform } from 'react-native';

// Use hardcoded version to avoid Metro bundling issues
const RN_VERSION = '0.79.5';

// Polyfill for missing reactNativeVersion
if (!(Platform as any).reactNativeVersion) {
  (Platform as any).reactNativeVersion = RN_VERSION;
}

// Add to global for HMR client if needed
if (typeof global !== 'undefined') {
  (global as any).reactNativeVersion = RN_VERSION;
}

// Make sure Platform constants exist
if (!(Platform as any).constants) {
  (Platform as any).constants = {};
}

if (!(Platform as any).constants.reactNativeVersion) {
  (Platform as any).constants.reactNativeVersion = RN_VERSION;
}

console.log('Platform polyfill applied with reactNativeVersion:', RN_VERSION);
