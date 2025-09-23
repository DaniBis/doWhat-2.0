import { ExpoConfig } from 'expo/config';

// Import JSON config
import appJson from './app.json';

// Read environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Ensure Android manifest has a concrete Google Maps API key to avoid placeholder errors during build
const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  'dev-placeholder-key';

const config = {
  ...appJson.expo,
  plugins: appJson.expo?.plugins ?? [],
  ios: {
    ...appJson.expo?.ios,
    infoPlist: {
      ...(appJson.expo?.ios?.infoPlist || {}),
      UIBackgroundModes: [
        ...(appJson.expo?.ios?.infoPlist?.UIBackgroundModes || []),
        'location',
      ],
    },
  },
  android: {
    ...appJson.expo?.android,
    config: {
      ...(appJson.expo?.android?.config || {}),
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  extra: {
    ...appJson.expo.extra,
    supabaseUrl,
    supabaseAnonKey,
    eas: {
      projectId: "your-eas-project-id", // Replace with your EAS project ID if needed
    },
  },
};

export default config;
