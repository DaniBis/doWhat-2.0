import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const replaceMock = jest.fn();
const getUserMock = jest.fn();
const isEmailConfirmedMock = jest.fn();
const loadCoreOnboardingProgressMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
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

import { useCoreAccessGuard } from '../useCoreAccessGuard';

const Harness = ({ redirectTo, bypass = false }: { redirectTo: string; bypass?: boolean }) => {
  const state = useCoreAccessGuard(redirectTo, { bypass });
  return <span data-testid="guard-state">{state}</span>;
};

describe('useCoreAccessGuard', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    getUserMock.mockReset();
    isEmailConfirmedMock.mockReset();
    loadCoreOnboardingProgressMock.mockReset();
  });

  it('redirects unauthenticated users to /auth and preserves query string', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    render(<Harness redirectTo="/map?q=climbing&debug=1" />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/auth?redirect=%2Fmap%3Fq%3Dclimbing%26debug%3D1');
    });
  });

  it('redirects unconfirmed users to confirm-email gate', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    isEmailConfirmedMock.mockReturnValue(false);

    render(<Harness redirectTo="/venues?radius=25" />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/auth/confirm-email?redirect=%2Fvenues%3Fradius%3D25');
    });
  });

  it('redirects users with pending onboarding steps', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    isEmailConfirmedMock.mockReturnValue(true);
    loadCoreOnboardingProgressMock.mockResolvedValue({ pendingSteps: ['values'] });

    render(<Harness redirectTo="/create?activityId=abc" />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/core-values?next=%2Fcreate%3FactivityId%3Dabc');
    });
  });

  it('allows access when all guards pass', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    isEmailConfirmedMock.mockReturnValue(true);
    loadCoreOnboardingProgressMock.mockResolvedValue({ pendingSteps: [] });

    render(<Harness redirectTo="/" />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-state')).toHaveTextContent('allowed');
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('allows access immediately when bypass is enabled', async () => {
    render(<Harness redirectTo="/map?e2e=1" bypass />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-state')).toHaveTextContent('allowed');
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
