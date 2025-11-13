import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Linking, Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { getDeepLinkParam } from '../lib/deepLinking';

type AuthSessionLike = {
  makeRedirectUri: (options?: { useProxy?: boolean; path?: string; scheme?: string }) => string;
  startAsync?: (config: { authUrl: string; returnUrl?: string }) => Promise<{ type: string; url?: string; params?: Record<string, string> }>;
};

const FALLBACK_SCHEME = 'dowhat';

const fallbackAuthSession: AuthSessionLike = {
  makeRedirectUri: ({ path, scheme } = {}) => {
    const resolvedScheme = scheme || FALLBACK_SCHEME;
    return path ? `${resolvedScheme}://${path}` : `${resolvedScheme}://auth-callback`;
  },
  startAsync: undefined,
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
    try {
      WebBrowser.maybeCompleteAuthSession?.();
    } catch {}

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
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleURL(initialUrl);
    });
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

  const redirectTo = useMemo(() => {
    const scheme = (Constants?.expoConfig?.scheme as string | undefined) ?? FALLBACK_SCHEME;
    const appOwnership = Constants?.appOwnership ?? null;
    const shouldUseProxy = appOwnership === 'expo' && Platform.OS !== 'web';

    try {
      return AuthSession.makeRedirectUri({
        path: 'auth-callback',
        scheme,
        useProxy: shouldUseProxy,
      });
    } catch (error) {
      if (__DEV__) console.warn('[auth] makeRedirectUri failed, falling back', error);
      return `${scheme}://auth-callback`;
    }
  }, []);

  const startAuthFlow = useMemo(() => {
    return async (authUrl: string) => {
      if (!authUrl) return null;

      if (AuthSession.startAsync) {
        return AuthSession.startAsync({ authUrl, returnUrl: redirectTo });
      }

      if (WebBrowser.openAuthSessionAsync) {
        return WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      }

      await Linking.openURL(authUrl);
      return null;
    };
  }, [redirectTo]);

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
    setErr(null);
    setBusy(true);
    try {
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
        throw error;
      }
      if (!data?.url) {
        throw new Error('Unable to start Google sign-in.');
      }

      const result = await startAuthFlow(data.url);
      if (__DEV__) console.log('[auth] auth result', result);
      if (!result || typeof result !== 'object') {
        return;
      }

      if ('type' in result && result.type && result.type !== 'success') {
        if (__DEV__) console.log('[auth] auth flow ended with', result.type);
        return;
      }

      const paramsFromResult = 'params' in result ? result.params ?? {} : {};
      const errorMessage = paramsFromResult?.error_description || paramsFromResult?.error;
      if (errorMessage) {
        setErr(errorMessage);
        return;
      }

      const directCode = paramsFromResult?.code;
      const directAccessToken = paramsFromResult?.access_token;
      const directRefreshToken = paramsFromResult?.refresh_token;
      if (directCode) {
        await supabase.auth.exchangeCodeForSession(directCode);
        setErr(null);
        return;
      }
      if (directAccessToken) {
        await supabase.auth.setSession({ access_token: directAccessToken, refresh_token: directRefreshToken ?? '' });
        setErr(null);
        return;
      }

      const url = 'url' in result && typeof result.url === 'string' ? result.url : undefined;
      if (!url) {
        setErr('Google sign-in did not return a session.');
        return;
      }

      const fragment = url.split('#')[1] || '';
      const query = url.split('?')[1] || '';
      const params = new URLSearchParams(fragment || query);
      const code = params.get('code') || undefined;
      const accessToken = params.get('access_token') || undefined;
      const refreshToken = params.get('refresh_token') || undefined;
      const paramError = params.get('error') || params.get('error_description');

      if (paramError) {
        setErr(paramError);
        return;
      }

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        setErr(null);
        return;
      }
      if (accessToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        setErr(null);
        return;
      }

      setErr('Google sign-in was cancelled before completion.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      if (__DEV__) console.warn('[auth] signIn error', message, error);
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setErr(null);
  }

  async function signInWithEmail() {
    setErr(null);
    setBusy(true);
    try {
      if (!email || !password) throw new Error('Email and password are required');
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setErr('Check your inbox to confirm your email before signing in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'email_address_invalid') {
        setErr('Please use a valid email address (e.g., Gmail or your real provider).');
        return;
      }
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

              {err && !emailMode && (
                <Text style={{ color: '#b91c1c', fontWeight: '500', textAlign: 'center' }}>{err}</Text>
              )}

              <Pressable
                onPress={() => {
                  setErr(null);
                  setEmailMode(true);
                }}
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
                <Pressable
                  onPress={() => {
                    setErr(null);
                    setIsSignup((value) => !value);
                  }}
                >
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
              <Pressable
                onPress={() => {
                  setErr(null);
                  setEmailMode(false);
                }}
              >
                <Text style={{ color: '#475569', textAlign: 'center', fontWeight: '500' }}>Back</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
