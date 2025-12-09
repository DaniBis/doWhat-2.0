import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

const REDIRECT_URL = 'dowhat://auth-callback';

type AuthSessionResponse = { type: 'success' | 'cancel' | 'dismiss'; url?: string };

const parseAuthParams = (rawUrl: string) => {
  const fragment = rawUrl.split('#')[1] || '';
  const query = rawUrl.split('?')[1] || '';
  const params = new URLSearchParams(fragment || query);
  return {
    code: params.get('code') || undefined,
    accessToken: params.get('access_token') || undefined,
    refreshToken: params.get('refresh_token') || undefined,
  };
};

export async function startGoogleSignIn() {
  if (__DEV__) console.log('[auth] starting Google sign-in flow');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) {
    if (__DEV__) console.log('[auth] signInWithOAuth error', error.message);
    throw error;
  }
  if (!data?.url) {
    if (__DEV__) console.log('[auth] missing auth url, aborting');
    return;
  }
  if (__DEV__) console.log('[auth] opening browser for auth');
  const result = (await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL)) as AuthSessionResponse;
  if (__DEV__) console.log('[auth] auth result', result);
  if (result.type !== 'success' || !result.url) {
    return;
  }
  const { code, accessToken, refreshToken } = parseAuthParams(result.url);
  if (__DEV__) console.log('[auth] parsed params', { hasCode: Boolean(code), hasAccessToken: Boolean(accessToken) });
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }
  if (accessToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
  }
}
