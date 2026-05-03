import {
  buildAuthCallbackUrl,
  resolveAuthOrigin,
  resolveAuthRedirectPath,
} from '@/lib/authRedirects';

describe('auth redirect helpers', () => {
  it('keeps Vercel preview auth callbacks on the current deployed origin', () => {
    expect(
      buildAuthCallbackUrl(
        'https://dowhat-preview-dani-bis-projects.vercel.app',
        '/map',
        'https://dowhat.example',
      ),
    ).toBe('https://dowhat-preview-dani-bis-projects.vercel.app/auth/callback?next=%2Fmap');

    expect(
      resolveAuthOrigin(
        'https://dowhat-preview-dani-bis-projects.vercel.app',
        'http://localhost:3000',
      ),
    ).toBe('https://dowhat-preview-dani-bis-projects.vercel.app');
  });

  it('uses a configured production site URL for non-preview deployed origins', () => {
    expect(
      buildAuthCallbackUrl(
        'https://dowhat-git-main-dani-bis-projects.vercel.app',
        '/',
        'https://dowhat.app',
      ),
    ).toBe('https://dowhat-git-main-dani-bis-projects.vercel.app/auth/callback?next=%2F');

    expect(
      buildAuthCallbackUrl(
        'https://preview.internal.example',
        '/profile',
        'https://dowhat.app',
      ),
    ).toBe('https://dowhat.app/auth/callback?next=%2Fprofile');
  });

  it('keeps local development callbacks on localhost', () => {
    expect(
      buildAuthCallbackUrl('http://localhost:3002', '/discover', 'https://dowhat.app'),
    ).toBe('http://localhost:3002/auth/callback?next=%2Fdiscover');
  });

  it('drops unsafe callback next targets', () => {
    expect(
      buildAuthCallbackUrl('https://dowhat.app', '//evil.example', 'https://dowhat.app'),
    ).toBe('https://dowhat.app/auth/callback');

    expect(
      resolveAuthRedirectPath(new URL('https://dowhat.app/auth/callback?next=https%3A%2F%2Fevil.example')),
    ).toBe('/');
  });

  it('resolves supported callback redirect params as path-only redirects', () => {
    expect(
      resolveAuthRedirectPath(new URL('https://dowhat.app/auth/callback?redirect=%2Fmap%3Fq%3Dchess')),
    ).toBe('/map?q=chess');
  });
});
