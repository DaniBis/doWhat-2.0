import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

type ExtraBag = Record<string, unknown>;

const pickExpoExtra = (): ExtraBag => {
  const expoExtra = Constants?.expoConfig?.extra;
  if (expoExtra && typeof expoExtra === 'object') {
    return expoExtra as ExtraBag;
  }
  // Fallback to legacy manifest fields only if expoConfig is missing (e.g., older dev clients)
  const legacyManifest = (Constants as unknown as { manifest2?: { extra?: ExtraBag } })?.manifest2?.extra;
  if (legacyManifest && typeof legacyManifest === 'object') {
    return legacyManifest;
  }
  const veryLegacyManifest = (Constants as unknown as { manifest?: { extra?: ExtraBag } })?.manifest?.extra;
  if (veryLegacyManifest && typeof veryLegacyManifest === 'object') {
    return veryLegacyManifest;
  }
  return {};
};

const extra = pickExpoExtra();

const readString = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const raw = extra?.[key];
    if (typeof raw === 'string') {
      return raw.trim();
    }
  }
  return undefined;
};

const PLACEHOLDER_PATTERNS = [
  /YOUR[_-]?PROJECT/i,
  /YOUR[_-]?SUPABASE/i,
  /YOUR[_-]?ANON/i,
  /YOUR[_-]?KEY/i,
  /your_supabase_url_here/i,
  /your_supabase_anon_key_here/i,
  /dev-placeholder/i,
];

const sanitize = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) return undefined;
  return trimmed;
};

// Read from Constants.expoConfig.extra - this is the only reliable source in React Native
const supabaseUrl = sanitize(readString('supabaseUrl'));
const supabaseKey = sanitize(readString('supabaseAnonKey'));

console.log('[supabase] resolved env', {
  extra,
  chosenUrl: supabaseUrl,
  hasKey: Boolean(supabaseKey),
  keyLength: supabaseKey?.length,
});

if (!supabaseUrl || !supabaseKey) {
  const errorMsg = `Supabase environment variables are not configured. URL=${supabaseUrl ? 'set' : 'missing'}, Key=${supabaseKey ? 'set' : 'missing'}. Check expo config --json | jq '.extra'`;
  console.error('[supabase]', errorMsg);
  throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
