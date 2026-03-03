import { buildAuthRedirectHref, buildConfirmEmailRedirectHref, deriveCoreOnboardingPendingSteps, isEmailConfirmed, sanitizeRedirectPath } from '../coreAccess';

describe('core access helpers', () => {
  it('sanitizes redirect paths and preserves valid query strings', () => {
    expect(sanitizeRedirectPath('/map?debug=1&types=chess')).toBe('/map?debug=1&types=chess');
    expect(sanitizeRedirectPath('https://evil.example/steal')).toBe('/');
    expect(sanitizeRedirectPath('//evil.example/steal')).toBe('/');
  });

  it('builds auth redirects with encoded return targets', () => {
    expect(buildAuthRedirectHref('/map?q=chess&debug=1')).toBe('/auth?redirect=%2Fmap%3Fq%3Dchess%26debug%3D1');
    expect(buildConfirmEmailRedirectHref('/venues?radius=50')).toBe('/auth/confirm-email?redirect=%2Fvenues%3Fradius%3D50');
  });

  it('detects email confirmation from email and oauth sessions', () => {
    expect(
      isEmailConfirmed({ email_confirmed_at: '2026-03-01T12:00:00.000Z', app_metadata: { provider: 'email' } } as never),
    ).toBe(true);

    expect(
      isEmailConfirmed({ email_confirmed_at: null, app_metadata: { provider: 'google' } } as never),
    ).toBe(true);

    expect(
      isEmailConfirmed({ email_confirmed_at: null, confirmed_at: null, app_metadata: { provider: 'email' } } as never),
    ).toBe(false);
  });

  it('requires traits, values, and pledge before core app unlock', () => {
    expect(
      deriveCoreOnboardingPendingSteps({
        traitCount: 5,
        coreValues: ['Respect', 'Focus', 'Curiosity'],
        pledgeAckAt: '2026-03-02T09:00:00.000Z',
      }),
    ).toEqual([]);

    expect(
      deriveCoreOnboardingPendingSteps({
        traitCount: 4,
        coreValues: ['Respect'],
        pledgeAckAt: null,
      }),
    ).toEqual(['traits', 'values', 'pledge']);
  });
});
