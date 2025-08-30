import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';

function useSupabaseOAuthListener() {
  useEffect(() => {
    async function handleURL(url: string) {
      try {
        const { queryParams } = Linking.parse(url);
        const code = (queryParams?.code as string) || undefined;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {}
    }

    const sub = Linking.addEventListener('url', ({ url }) => handleURL(url));
    Linking.getInitialURL().then((url) => url && handleURL(url));
    return () => sub.remove();
  }, []);
}

export default function AuthButtons() {
  useSupabaseOAuthListener();

  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUserEmail(data.user?.email ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  async function signIn() {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'dowhat' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      console.warn(error.message);
      return;
    }
    if (data?.url) {
      await AuthSession.startAsync({ authUrl: data.url });
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={{ padding: 12, gap: 8 }}>
      {userEmail ? (
        <>
          <Text>Signed in as {userEmail}</Text>
          <Pressable onPress={signOut} style={{ padding: 8, borderWidth: 1, borderRadius: 8 }}>
            <Text>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={signIn} style={{ padding: 8, borderWidth: 1, borderRadius: 8 }}>
          <Text>Sign in with Google</Text>
        </Pressable>
      )}
    </View>
  );
}

