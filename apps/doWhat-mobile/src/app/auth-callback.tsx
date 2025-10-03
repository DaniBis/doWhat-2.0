import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text } from 'react-native';

import { supabase } from '../lib/supabase';

type ParsedQueryParams = Record<string, string | string[] | null | undefined> | null | undefined;

const extractParam = (params: ParsedQueryParams, key: string): string | undefined => {
  const value = params?.[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.length > 0);
    return first;
  }
  return undefined;
};

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const url = initialUrl ?? '';
        const parsed = Linking.parse(url);
        const path = typeof parsed.path === 'string' ? parsed.path : undefined;
        const code = extractParam(parsed.queryParams, 'code');
        const accessToken = extractParam(parsed.queryParams, 'access_token');
        const refreshToken = extractParam(parsed.queryParams, 'refresh_token');
        if (__DEV__) console.log('[auth-callback] path, params', path, { hasCode: !!code, hasAccess: !!accessToken });
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth-callback] error', error instanceof Error ? error.message : error);
        }
      } finally {
        router.replace('/');
      }
    })();
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Finishing sign in…</Text>
    </View>
  );
}
