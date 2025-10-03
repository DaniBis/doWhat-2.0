import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Prefer EXPO_PUBLIC_*; fall back to NEXT_PUBLIC_* or Expo extra config for local dev
const extra = (Constants?.expoConfig?.extra || {}) as Record<string, unknown>;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  (typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl : undefined);
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey : undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
