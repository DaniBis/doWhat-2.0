const createClientMock = jest.fn();
const redirectMock = jest.fn();
const isEmailConfirmedMock = jest.fn();
const loadCoreOnboardingProgressMock = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

jest.mock('../coreAccess', () => ({
  sanitizeRedirectPath: (value: string | null | undefined, fallback = '/') => {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
    return value;
  },
  buildAuthRedirectHref: (redirectTo: string) => `/auth?redirect=${encodeURIComponent(redirectTo)}`,
  buildConfirmEmailRedirectHref: (redirectTo: string) => `/auth/confirm-email?redirect=${encodeURIComponent(redirectTo)}`,
  buildOnboardingRedirectHref: (step: string, redirectTo: string) => {
    const routeMap: Record<string, string> = {
      traits: '/onboarding/traits',
      values: '/onboarding/core-values',
      pledge: '/onboarding/reliability-pledge',
    };
    return `${routeMap[step] ?? '/onboarding'}?next=${encodeURIComponent(redirectTo)}`;
  },
  isEmailConfirmed: (...args: unknown[]) => isEmailConfirmedMock(...args),
  loadCoreOnboardingProgress: (...args: unknown[]) => loadCoreOnboardingProgressMock(...args),
}));

import { enforceServerCoreAccess } from '../serverGuard';

class RedirectError extends Error {
  destination: string;
  digest: string;

  constructor(destination: string) {
    super(`redirect:${destination}`);
    this.destination = destination;
    this.digest = `NEXT_REDIRECT;replace;${destination}`;
  }
}

describe('enforceServerCoreAccess', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    redirectMock.mockReset();
    isEmailConfirmedMock.mockReset();
    loadCoreOnboardingProgressMock.mockReset();

    redirectMock.mockImplementation((destination: string) => {
      throw new RedirectError(destination);
    });
  });

  it('redirects anonymous visitors to /auth and preserves full query string', async () => {
    createClientMock.mockReturnValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    });

    await expect(enforceServerCoreAccess('/map?q=chess&debug=1')).rejects.toMatchObject({
      destination: '/auth?redirect=%2Fmap%3Fq%3Dchess%26debug%3D1',
    });
  });

  it('redirects signed-in users with unconfirmed email to confirm-email gate', async () => {
    createClientMock.mockReturnValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    });
    isEmailConfirmedMock.mockReturnValue(false);

    await expect(enforceServerCoreAccess('/venues?radius=25')).rejects.toMatchObject({
      destination: '/auth/confirm-email?redirect=%2Fvenues%3Fradius%3D25',
    });
  });

  it('redirects to first incomplete onboarding step before allowing core pages', async () => {
    const supabase = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    };
    createClientMock.mockReturnValue(supabase);
    isEmailConfirmedMock.mockReturnValue(true);
    loadCoreOnboardingProgressMock.mockResolvedValue({ pendingSteps: ['values'] });

    await expect(enforceServerCoreAccess('/create?activityId=abc')).rejects.toMatchObject({
      destination: '/onboarding/core-values?next=%2Fcreate%3FactivityId%3Dabc',
    });
    expect(loadCoreOnboardingProgressMock).toHaveBeenCalledWith(supabase, 'user-1');
  });

  it('returns user and supabase when all access checks pass', async () => {
    const supabase = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    };
    createClientMock.mockReturnValue(supabase);
    isEmailConfirmedMock.mockReturnValue(true);
    loadCoreOnboardingProgressMock.mockResolvedValue({ pendingSteps: [] });

    const result = await enforceServerCoreAccess('/');

    expect(result).toEqual({ user: { id: 'user-1' }, supabase });
  });
});
