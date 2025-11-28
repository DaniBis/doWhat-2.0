import { ConfigContext, ExpoConfig } from 'expo/config';
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const loadEnvFile = (relativePath: string) => {
  const fullPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(fullPath)) {
    loadEnv({ path: fullPath, override: false });
  }
};

loadEnvFile('../../.env');
loadEnvFile('../../.env.local');
loadEnvFile('./.env');
loadEnvFile('./.env.local');

export default ({ config }: ConfigContext): ExpoConfig => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const webBaseUrl =
    process.env.EXPO_PUBLIC_WEB_URL ||
    process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_WEB_URL;

  // Ensure Android manifest has a concrete Google Maps API key to avoid placeholder errors during build
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    'dev-placeholder-key';

  const plugins = new Set(config.plugins ?? []);
  plugins.add('expo-router');
  plugins.add([
    'expo-build-properties',
    {
      ios: {
        deploymentTarget: '15.1',
      },
    },
  ]);

  return {
    name: 'doWhat',
    slug: 'doWhat-mobile',
    scheme: 'dowhat',
    version: '1.0.0',
    entryPoint: './index.ts',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    jsEngine: 'hermes',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      bundleIdentifier: 'com.dowhat.app',
      deploymentTarget: '15.1',
      supportsTablet: true,
      config: {
        googleMapsApiKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'We use your location to find nearby activities.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow doWhat to access your location in the background to keep nearby activities up to date.',
        UIBackgroundModes: ['location'],
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      package: 'com.dowhat.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'READ_MEDIA_IMAGES',
      ],
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: supabaseUrl ?? '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ?? '',
      supabaseUrl,
      supabaseAnonKey,
      webBaseUrl,
      eas: {
        projectId: 'your-eas-project-id',
      },
    },
    plugins: Array.from(plugins),
  };
};
