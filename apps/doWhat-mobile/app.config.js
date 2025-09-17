import { ExpoConfig } from 'expo/config';

// Import JSON config
import appJson from './app.json';

// Read environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
