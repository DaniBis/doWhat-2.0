import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Linking } from 'react-native';

import { supabase } from '../lib/supabase';
import { getDeepLinkParam } from '../lib/deepLinking';

type AuthSessionLike = {
  makeRedirectUri: (options?: { useProxy?: boolean; path?: string }) => string;
};

const fallbackAuthSession: AuthSessionLike = {
  makeRedirectUri: ({ path } = {}) => (path ? `dowhat://${path}` : 'dowhat://auth-callback'),
};

let AuthSession: AuthSessionLike = fallbackAuthSession;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('expo-auth-session');
  if (loaded && typeof loaded.makeRedirectUri === 'function') {
    AuthSession = loaded;
  }
} catch {
  console.warn('[auth] expo-auth-session not fully available; falling back to basic redirect');
}

type LinkingEvent = { url: string };

const extractQueryParam = (url: string, key: string): string | undefined => getDeepLinkParam(url, key);

function useSupabaseOAuthListener() {
  useEffect(() => {
    // Completes auth session on iOS after returning from SFSafariViewController
    try { WebBrowser.maybeCompleteAuthSession?.(); } catch {}

    const handleURL = async (url: string) => {
      try {
        const code = extractQueryParam(url, 'code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (error) {
        if (__DEV__) console.warn('[auth] listener error', error);
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }: LinkingEvent) => handleURL(url));
    Linking.getInitialURL().then((initialUrl) => { if (initialUrl) handleURL(initialUrl); });
    return () => subscription.remove();
  }, []);
}

export default function AuthButtons() {
  useSupabaseOAuthListener();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    // Compute both native deep link and Expo proxy URL; prefer proxy in Expo Go
    const redirectTo = AuthSession.makeRedirectUri({ useProxy: true, path: 'auth-callback' });
    if (__DEV__) console.log('[auth] redirectTo', redirectTo);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
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
      const result = WebBrowser.openAuthSessionAsync
        ? await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
        : null;
      if (__DEV__) console.log('[auth] auth result', result);
      if (result?.type === 'success' && result.url) {
        // Parse both fragment (#) and query (?) params
        const url = result.url;
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

  async function signInWithEmail() {
    setErr(null);
    setBusy(true);
    try {
      if (!email || !password) throw new Error('Email and password are required');
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {userEmail ? (
        <>
          <View style={{ gap: 4, alignItems: 'center' }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Signed in as</Text>
            <Text style={{ color: '#0f172a', fontSize: 16 }}>{userEmail}</Text>
          </View>
          <Pressable
            onPress={signOut}
            style={{
              marginTop: 6,
              alignSelf: 'center',
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#34d399',
              backgroundColor: '#ecfdf5',
            }}
          >
            <Text style={{ color: '#0d9488', fontWeight: '600' }}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <View style={{ gap: 14 }}>
          {!emailMode && (
            <View style={{ gap: 12 }}>
              <Pressable
                onPress={signIn}
                disabled={busy}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 16,
                  borderRadius: 18,
                  backgroundColor: '#0f172a',
                  shadowColor: '#0f172a',
                  shadowOpacity: 0.15,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 4,
                  opacity: busy ? 0.7 : 1,
                  gap: 12,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#f8fafc" />
                ) : (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: '#f8fafc',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>G</Text>
                  </View>
                )}
                <Text style={{ color: '#f1f5f9', fontSize: 16, fontWeight: '700' }}>Continue with Google</Text>
              </Pressable>

              <Pressable
                onPress={() => setEmailMode(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 15,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#cbd5f5',
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '600' }}>Use email instead</Text>
              </Pressable>
            </View>
          )}
          {emailMode && (
            <View style={{ gap: 12, backgroundColor: '#f8fafc', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>
                  {isSignup ? 'Create account' : 'Sign in with email'}
                </Text>
                <Pressable onPress={() => setIsSignup(!isSignup)}>
                  <Text style={{ color: '#0d9488', fontWeight: '600' }}>
                    {isSignup ? 'Have an account?' : 'Need an account?'}
                  </Text>
                </Pressable>
              </View>
              <TextInput
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  backgroundColor: '#fff',
                }}
              />
              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  backgroundColor: '#fff',
                }}
              />
              {err && (
                <Text style={{ color: '#b91c1c', fontWeight: '500', textAlign: 'center' }}>{err}</Text>
              )}
              <Pressable
                onPress={signInWithEmail}
                disabled={busy}
                style={{
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: busy ? '#9ca3af' : '#10b981',
                  alignItems: 'center',
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#f8fafc" />
                ) : (
                  <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>
                    {isSignup ? 'Create account' : 'Sign in'}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={() => setEmailMode(false)}>
                <Text style={{ color: '#475569', textAlign: 'center', fontWeight: '500' }}>Back</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
