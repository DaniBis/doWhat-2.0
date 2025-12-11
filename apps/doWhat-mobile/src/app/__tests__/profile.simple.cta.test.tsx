import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../lib/web', () => ({
  createWebUrl: (path: string) => new URL(`https://example.org${path}`),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

const profileState = {
  baseTraitCount: 0,
  profileRow: {
    id: 'user-mobile',
    full_name: 'Test User',
    avatar_url: null,
    instagram: null,
    whatsapp: null,
    bio: null,
    location: null,
    personality_traits: [],
    primary_sport: null,
    reliability_pledge_ack_at: null as string | null,
    reliability_pledge_version: null as string | null,
  },
};

const createUserBaseTraitsBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(async () => ({ data: [], error: null, count: profileState.baseTraitCount }));
  return builder;
};

const createProfilesBuilder = () => {
  const builder: any = { mode: 'read' };
  builder.select = jest.fn(() => {
    builder.mode = 'read';
    return builder;
  });
  builder.update = jest.fn(() => {
    builder.mode = 'write';
    return builder;
  });
  builder.upsert = jest.fn(async () => ({ data: null, error: null }));
  builder.eq = jest.fn(() => {
    if (builder.mode === 'write') {
      return Promise.resolve({ data: null, error: null });
    }
    return builder;
  });
  builder.maybeSingle = jest.fn(async () => ({ data: profileState.profileRow, error: null }));
  builder.single = jest.fn(async () => ({ data: profileState.profileRow, error: null }));
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.range = jest.fn(() => builder);
  builder.insert = jest.fn(() => {
    builder.mode = 'write';
    return builder;
  });
  return builder;
};

jest.mock('../../lib/supabase', () => {
  const auth = {
    getUser: jest.fn(async () => ({ data: { user: { id: 'user-mobile', user_metadata: {} } } })),
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: { unsubscribe: jest.fn() },
      },
    })),
    signOut: jest.fn(async () => ({ error: null })),
    updateUser: jest.fn(async () => ({ error: null })),
  };

  const supabaseMock = {
    auth,
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: { path: 'avatar.png' }, error: null })),
        remove: jest.fn(async () => ({ data: null, error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.org/avatar.png' } })),
      })),
    },
    from: jest.fn((table: string) => {
      if (table === 'user_base_traits') {
        return createUserBaseTraitsBuilder();
      }
      if (table === 'profiles') {
        return createProfilesBuilder();
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase: supabaseMock,
    __supabaseMock: {
      setBaseTraitCount: (count: number) => {
        profileState.baseTraitCount = count;
      },
      supabase: supabaseMock,
    },
  };
});

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: { setBaseTraitCount: (count: number) => void; supabase: { auth: { getUser: jest.Mock }; } };
};

const { trackOnboardingEntry } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
};

const resetTestState = () => {
  jest.clearAllMocks();
  installFetchMock();
  trackOnboardingEntry.mockClear();
  profileState.profileRow.reliability_pledge_ack_at = null;
  profileState.profileRow.reliability_pledge_version = null;
  __supabaseMock.setBaseTraitCount(0);
};

const mockFetchResponse = (body: unknown): Response => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

const installFetchMock = () => {
  global.fetch = jest.fn(async (input: string | URL) => {
    const target = typeof input === 'string' ? input : input.toString();
    if (target.includes('/api/users/') && target.includes('/badges')) {
      return mockFetchResponse({ badges: [] });
    }
    if (target.includes('/api/badges/catalog')) {
      return mockFetchResponse({ badges: [] });
    }
    if (target.includes('/api/profile/') && target.includes('/traits')) {
      return mockFetchResponse([]);
    }
    return mockFetchResponse({});
  }) as unknown as typeof fetch;
};

import ProfileScreen from '../profile.simple';

describe('Mobile Profile trait onboarding CTA', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('renders the CTA when the user has fewer than five base traits', async () => {
    __supabaseMock.setBaseTraitCount(2);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(__supabaseMock.supabase.auth.getUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Personality traits')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Finish onboarding')).toBeTruthy());
    expect(screen.getByText(/Add 3 more traits/i)).toBeTruthy();
  });

  it('hides the CTA once the base stack is complete', async () => {
    __supabaseMock.setBaseTraitCount(5);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(__supabaseMock.supabase.auth.getUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Personality traits')).toBeTruthy());
    await waitFor(() => {
      expect(screen.queryByText('Finish onboarding')).toBeNull();
    });
  });

  it('tracks analytics when the CTA is pressed', async () => {
    __supabaseMock.setBaseTraitCount(2);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Choose traits')).toBeTruthy());
    fireEvent.press(screen.getByText('Choose traits'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({ source: 'profile-traits-banner', platform: 'mobile', step: 'traits' });
  });
});

describe('Mobile Profile reliability pledge CTA', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('renders the reliability CTA when no pledge record exists', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Reliability pledge')).toBeTruthy());
    expect(screen.getByText('Lock your reliability pledge')).toBeTruthy();
    expect(screen.getByText('Review pledge')).toBeTruthy();
  });

  it('shows the success copy once the pledge is acknowledged', async () => {
    profileState.profileRow.reliability_pledge_ack_at = '2025-12-01T00:00:00.000Z';
    profileState.profileRow.reliability_pledge_version = 'v2';

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.queryByText('Review pledge')).toBeNull());
    expect(screen.getByText(/You accepted version v2/i)).toBeTruthy();
  });

  it('tracks analytics when the reliability CTA is pressed', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Review pledge')).toBeTruthy());
    fireEvent.press(screen.getByText('Review pledge'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({ source: 'profile-pledge-banner', platform: 'mobile', step: 'pledge' });
  });
});
