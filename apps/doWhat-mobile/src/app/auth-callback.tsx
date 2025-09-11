import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text } from 'react-native';

import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        const url = initial ?? '';
        const { queryParams, path } = Linking.parse(url);
        const code = (queryParams?.code as string) || undefined;
        const accessToken = (queryParams?.access_token as string) || undefined;
        const refreshToken = (queryParams?.refresh_token as string) || undefined;
        if (__DEV__) console.log('[auth-callback] path, params', path, { hasCode: !!code, hasAccess: !!accessToken });
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        }
      } catch (e) {
        if (__DEV__) console.warn('[auth-callback] error', (e as any)?.message);
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
