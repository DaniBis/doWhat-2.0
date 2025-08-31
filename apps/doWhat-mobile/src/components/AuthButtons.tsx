import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
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
    Linking.getInitialURL().then((url) => { if (url) handleURL(url); });
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
    // Deep link target handled by app; Supabase must allow this in Redirect URLs.
    const redirectTo = 'dowhat://auth-callback';
    if (__DEV__) console.log('[auth] redirectTo', redirectTo);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (__DEV__) console.log('[auth] signInWithOAuth error?', error?.message);
    if (__DEV__) console.log('[auth] supabase auth url', data?.url);
    if (error) {
      console.warn('[auth] error', error.message);
      return;
    }
    if (data?.url) {
      // Open auth and wait for redirect back to our redirectTo
      if (__DEV__) console.log('[auth] opening browser to', data.url);
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (__DEV__) console.log('[auth] auth result', res);
      if (res.type === 'success' && res.url) {
        // Parse both fragment (#) and query (?) params
        const url = res.url;
        const fragment = url.split('#')[1] || '';
        const query = url.split('?')[1] || '';
        const params = new URLSearchParams(fragment || query);
        const code = params.get('code') || undefined;
        const accessToken = params.get('access_token') || undefined;
        const refreshToken = params.get('refresh_token') || undefined;
        if (__DEV__) console.log('[auth] parsed params', { code, accessToken: !!accessToken, refreshToken: !!refreshToken });
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        }
      }
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
