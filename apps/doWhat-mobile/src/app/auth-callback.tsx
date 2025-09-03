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
        const { queryParams } = Linking.parse(url);
        const code = (queryParams?.code as string) || undefined;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {}
      // Navigate home after handling
      router.replace('/');
    })();
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Finishing sign in…</Text>
    </View>
  );
}

