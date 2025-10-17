import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, Linking } from 'react-native';

import { supabase } from '../lib/supabase';
import { parseDeepLink } from '../lib/deepLinking';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const url = initialUrl ?? '';
  const parsed = parseDeepLink(url);
  const path = parsed.path ?? undefined;
  const code = parsed.getParam('code');
  const accessToken = parsed.getParam('access_token');
  const refreshToken = parsed.getParam('refresh_token');
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
