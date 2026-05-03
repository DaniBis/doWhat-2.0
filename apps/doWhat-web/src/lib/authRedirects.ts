import { sanitizeRedirectPath } from '@/lib/access/coreAccess';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const AUTH_REDIRECT_PARAMS = ['redirect', 'next', 'redirect_to', 'redirectTo'] as const;

const normalizeOrigin = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
};

const isLocalOrigin = (origin: string): boolean => {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};

const isVercelPreviewOrigin = (origin: string): boolean => {
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

export const resolveAuthOrigin = (
  currentOrigin: string,
  configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): string => {
  const current = normalizeOrigin(currentOrigin);
  const configured = normalizeOrigin(configuredSiteUrl);

  if (!current) return configured ?? 'http://localhost:3000';
  if (isLocalOrigin(current)) return current;
  if (isVercelPreviewOrigin(current)) return current;
  if (configured && !isLocalOrigin(configured)) return configured;
  return current;
};

export const buildAuthCallbackUrl = (
  currentOrigin: string,
  redirectTo?: string | null,
  configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): string => {
  const url = new URL('/auth/callback', resolveAuthOrigin(currentOrigin, configuredSiteUrl));
  const next = sanitizeRedirectPath(redirectTo, '');
  if (next) url.searchParams.set('next', next);
  return url.toString();
};

export const resolveAuthRedirectPath = (url: URL, fallback = '/'): string => {
  for (const param of AUTH_REDIRECT_PARAMS) {
    const candidate = sanitizeRedirectPath(url.searchParams.get(param), '');
    if (candidate) return candidate;
  }
  return sanitizeRedirectPath(fallback, '/');
};
