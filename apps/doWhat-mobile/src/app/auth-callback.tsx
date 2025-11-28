import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Linking } from 'react-native';

import { supabase } from '../lib/supabase';
import { parseDeepLink } from '../lib/deepLinking';

type TokenBundle = {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
};

const normalizeParam = (value?: string | string[]): string | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).find((entry) => !!entry) || undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const routeTokens = useMemo<TokenBundle>(() => {
    return {
      code: normalizeParam(params.code as string | string[] | undefined),
      accessToken: normalizeParam(params.access_token as string | string[] | undefined),
      refreshToken: normalizeParam(params.refresh_token as string | string[] | undefined),
    };
  }, [params]);

  const handleTokens = useCallback(async ({ code, accessToken, refreshToken }: TokenBundle, source: string) => {
    if (__DEV__) {
      console.log('[auth-callback] resolving tokens', source, { hasCode: !!code, hasAccess: !!accessToken });
    }
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      return true;
    }
    if (accessToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        if ((routeTokens.code || routeTokens.accessToken) && !cancelled) {
          const handled = await handleTokens(routeTokens, 'route');
          if (handled) return;
        }

        const initialUrl = await Linking.getInitialURL();
        const parsed = parseDeepLink(initialUrl ?? '');
        const fallbackTokens: TokenBundle = {
          code: parsed.getParam('code'),
          accessToken: parsed.getParam('access_token'),
          refreshToken: parsed.getParam('refresh_token'),
        };
        const handledFallback = await handleTokens(fallbackTokens, 'linking');
        if (!handledFallback && !cancelled) {
          setErrorMessage('Could not complete sign in. Please try again.');
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unexpected error while finishing sign in.';
          setErrorMessage(message);
          if (__DEV__) console.warn('[auth-callback] error', message);
        }
      } finally {
        if (!cancelled) {
          router.replace('/');
        }
      }
    };

    finish();
    return () => {
      cancelled = true;
    };
  }, [handleTokens, routeTokens, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F172A' }}>Finishing sign in…</Text>
      {errorMessage ? (
        <Text style={{ marginTop: 12, color: '#B91C1C', textAlign: 'center' }}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}
