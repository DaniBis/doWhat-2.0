import * as Linking from 'expo-linking';
// Attempt to import expo-auth-session (depends on ExpoCrypto). If native module missing, degrade gracefully.
let AuthSession: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AuthSession = require('expo-auth-session');
} catch (e) {
  AuthSession = {
    makeRedirectUri: () => 'dowhat://auth-callback',
  };
  console.warn('[auth] expo-auth-session not fully available; falling back to basic redirect');
}
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';

import { supabase } from '../lib/supabase';

function useSupabaseOAuthListener() {
  useEffect(() => {
  // Completes auth session on iOS after returning from SFSafariViewController
  try { WebBrowser.maybeCompleteAuthSession(); } catch {}
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
  const redirectTo = AuthSession.makeRedirectUri?
    AuthSession.makeRedirectUri({ useProxy: true, path: 'auth-callback' } as any):
    'dowhat://auth-callback';
    if (__DEV__) console.log('[auth] redirectTo', redirectTo);
  const { data, error } = await (supabase.auth.signInWithOAuth as any)({
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
  const res = WebBrowser.openAuthSessionAsync ? await WebBrowser.openAuthSessionAsync(data.url, redirectTo) : { type: 'opened' };
      if (__DEV__) console.log('[auth] auth result', res);
      if (res.type === 'success' && (res as any).url) {
        // Parse both fragment (#) and query (?) params
        const url = (res as any).url as string;
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
    } catch (e: any) {
      setErr(e?.message ?? 'Authentication failed');
    } finally {
      setBusy(false);
    }
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
        <View style={{ gap: 10 }}>
          {!emailMode && (
            <>
              <Pressable onPress={signIn} style={{ padding: 12, borderWidth: 1, borderRadius: 10 }}>
                <Text>Continue with Google</Text>
              </Pressable>
              <Pressable onPress={() => setEmailMode(true)} style={{ padding: 12, borderWidth: 1, borderRadius: 10 }}>
                <Text>Continue with Email</Text>
              </Pressable>
            </>
          )}
          {emailMode && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '600' }}>{isSignup ? 'Create account' : 'Sign in with email'}</Text>
              <TextInput
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}
              />
              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}
              />
              {err && <Text style={{ color: '#b91c1c' }}>{err}</Text>}
              <Pressable onPress={signInWithEmail} disabled={busy} style={{ padding: 12, borderRadius: 10, backgroundColor: busy ? '#9ca3af' : '#10b981' }}>
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
                  {isSignup ? 'Create account' : 'Sign in'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setIsSignup(!isSignup)}>
                <Text style={{ color: '#0d9488', textAlign: 'center' }}>
                  {isSignup ? 'Have an account? Sign in' : "Don't have an account? Create one"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setEmailMode(false)}>
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>Back</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
