// Main entry point for the Expo app
import 'expo-router/entry';

// Add URL polyfill for React Native
import 'react-native-url-polyfill/auto';

// Register HMR handler explicitly for Hermes engine
if (__DEV__) {
  // This ensures HMRClient is properly initialized
  require('react-native/Libraries/Utilities/HMRClient');
}
