import Constants from 'expo-constants';

export const AUTH_CALLBACK_PATH = 'auth-callback';
export const FALLBACK_AUTH_SCHEME = 'dowhat';

export const resolveOAuthRedirectTo = (): string => {
  const scheme = (Constants?.expoConfig?.scheme as string | undefined) ?? FALLBACK_AUTH_SCHEME;
  return `${scheme}://${AUTH_CALLBACK_PATH}`;
};

export const parseAuthUrlRedirectTo = (authUrl: string): string | null => {
  if (!authUrl || typeof authUrl !== 'string') return null;
  try {
    const parsed = new URL(authUrl);
    const value = parsed.searchParams.get('redirect_to');
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
};

export const isLoopbackRedirect = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

export const ensureAuthUrlRedirectTo = (authUrl: string, redirectTo: string): string => {
  if (!authUrl || typeof authUrl !== 'string') return authUrl;
  if (!redirectTo || typeof redirectTo !== 'string') return authUrl;

  try {
    const parsed = new URL(authUrl);
    const current = parsed.searchParams.get('redirect_to');
    if (current !== redirectTo || isLoopbackRedirect(current)) {
      parsed.searchParams.set('redirect_to', redirectTo);
      return parsed.toString();
    }
    return authUrl;
  } catch {
    return authUrl;
  }
};
