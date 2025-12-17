import React from 'react';
import '@testing-library/jest-dom/jest-globals';
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

jest.mock('@/lib/supabase/server', () => ({
  __esModule: true,
  createClient: jest.fn(),
}));

type CreateClientFn = typeof import('@/lib/supabase/server').createClient;
const { createClient: createClientMock } = jest.requireMock('@/lib/supabase/server') as {
  createClient: jest.MockedFunction<CreateClientFn>;
};
const redirectMock = redirect as jest.MockedFunction<typeof redirect>;

jest.mock('@/components/traits/TraitOnboardingSection', () => ({
  TraitOnboardingSection: ({ className }: { className?: string }) => (
    <div data-testid="trait-onboarding-section" data-classname={className} />
  ),
}));

type MockSupabaseClient = {
  auth: {
    getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string } | null } }>>;
  };
};

const buildMockClient = (user: { id: string } | null): MockSupabaseClient => ({
  auth: {
    getUser: jest.fn(async () => ({ data: { user } })),
  },
});

describe('TraitOnboardingPage', () => {
  const loadTraitOnboardingPage = async () => (await import('../page')).default;

  beforeEach(() => {
    jest.clearAllMocks();
    createClientMock.mockReset();
    redirectMock.mockReset();
  });

  it('redirects unauthenticated users to login', async () => {
    const mockClient = buildMockClient(null);
    createClientMock.mockReturnValue(mockClient as unknown as SupabaseClient);
    redirectMock.mockImplementation(() => {
      throw new Error('redirect called');
    });

    const TraitOnboardingPage = await loadTraitOnboardingPage();

    await expect(TraitOnboardingPage()).rejects.toThrow('redirect called');
    expect(redirectMock).toHaveBeenCalledWith('/auth/login?next=%2Fonboarding%2Ftraits');
    expect(mockClient.auth.getUser).toHaveBeenCalled();
  });

  it('renders onboarding content when the user is signed in', async () => {
    const mockClient = buildMockClient({ id: 'user-123' });
    createClientMock.mockReturnValue(mockClient as unknown as SupabaseClient);

    const TraitOnboardingPage = await loadTraitOnboardingPage();
    const ui = await TraitOnboardingPage();
    render(ui);

    expect(screen.getByText('Lock in your base vibe')).toBeInTheDocument();
    expect(screen.getByText('Step 3 · Personalize')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to profile/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByTestId('trait-onboarding-section')).toHaveAttribute('data-classname', 'shadow-2xl shadow-emerald-500/20');
  });
});
