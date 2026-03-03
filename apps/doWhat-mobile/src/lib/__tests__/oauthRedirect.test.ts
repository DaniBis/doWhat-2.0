import {
  ensureAuthUrlRedirectTo,
  isLoopbackRedirect,
  parseAuthUrlRedirectTo,
} from '../oauthRedirect';

describe('oauthRedirect helpers', () => {
  it('parses redirect_to from auth url', () => {
    const value = parseAuthUrlRedirectTo(
      'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=dowhat%3A%2F%2Fauth-callback',
    );
    expect(value).toBe('dowhat://auth-callback');
  });

  it('detects loopback redirects', () => {
    expect(isLoopbackRedirect('http://localhost:3002/auth/callback')).toBe(true);
    expect(isLoopbackRedirect('http://127.0.0.1:3002/auth/callback')).toBe(true);
    expect(isLoopbackRedirect('dowhat://auth-callback')).toBe(false);
  });

  it('rewrites loopback redirect_to to app callback', () => {
    const normalized = ensureAuthUrlRedirectTo(
      'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3002%2Fauth%2Fcallback',
      'dowhat://auth-callback',
    );
    expect(parseAuthUrlRedirectTo(normalized)).toBe('dowhat://auth-callback');
  });

  it('injects redirect_to when missing', () => {
    const normalized = ensureAuthUrlRedirectTo(
      'https://example.supabase.co/auth/v1/authorize?provider=google',
      'dowhat://auth-callback',
    );
    expect(parseAuthUrlRedirectTo(normalized)).toBe('dowhat://auth-callback');
  });
});
