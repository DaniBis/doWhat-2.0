import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PlayStyle, SportType } from '@dowhat/shared';

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('../../lib/web', () => ({
  createWebUrl: (path: string) => new URL(`https://example.org${path}`),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const supabaseState = {
  baseTraitCount: 0,
  reliabilityPledgeAckAt: null as string | null,
  reliabilityPledgeVersion: null as string | null,
  primarySport: null as SportType | null,
  playStyle: null as PlayStyle | null,
  sportSkillLevel: null as string | null,
};

const createUserBaseTraitsBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(async () => ({ data: [], error: null, count: supabaseState.baseTraitCount }));
  return builder;
};

const createProfilesBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({
    data: {
      reliability_pledge_ack_at: supabaseState.reliabilityPledgeAckAt,
      reliability_pledge_version: supabaseState.reliabilityPledgeVersion,
      primary_sport: supabaseState.primarySport,
      play_style: supabaseState.playStyle,
    },
    error: null,
  }));
  return builder;
};

const createUserSportProfileBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({
    data: { skill_level: supabaseState.sportSkillLevel },
    error: null,
  }));
  return builder;
};

jest.mock('../../lib/supabase', () => {
  const auth = {
    getUser: jest.fn(async () => ({ data: { user: { id: 'user-mobile' } } })),
  };

  const supabaseMock = {
    auth,
    from: jest.fn((table: string) => {
      if (table === 'user_base_traits') {
        return createUserBaseTraitsBuilder();
      }
      if (table === 'profiles') {
        return createProfilesBuilder();
      }
      if (table === 'user_sport_profiles') {
        return createUserSportProfileBuilder();
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase: supabaseMock,
    __supabaseMock: {
      setBaseTraitCount: (count: number) => {
        supabaseState.baseTraitCount = count;
      },
      setPledgeState: ({ ackAt, version }: { ackAt: string | null; version?: string | null }) => {
        supabaseState.reliabilityPledgeAckAt = ackAt;
        supabaseState.reliabilityPledgeVersion = version ?? null;
      },
      setSportProfile: ({ primarySport, playStyle, skillLevel }: { primarySport: SportType | null; playStyle: PlayStyle | null; skillLevel: string | null }) => {
        supabaseState.primarySport = primarySport;
        supabaseState.playStyle = playStyle;
        supabaseState.sportSkillLevel = skillLevel;
      },
    },
  };
});

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    loadUserPreference: jest.fn(async () => null),
    saveUserPreference: jest.fn(async () => undefined),
    trackOnboardingEntry: jest.fn(),
  };
});

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    setBaseTraitCount: (count: number) => void;
    setPledgeState: (state: { ackAt: string | null; version?: string | null }) => void;
    setSportProfile: (state: { primarySport: SportType | null; playStyle: PlayStyle | null; skillLevel: string | null }) => void;
  };
};

const { trackOnboardingEntry } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
};

const { router } = jest.requireMock('expo-router') as {
  router: { push: jest.Mock };
};

const mockFetchResponse = (body: unknown): Response => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

const installFetchMock = () => {
  global.fetch = jest.fn(async (input: string | URL) => {
    const target = typeof input === 'string' ? input : input.toString();
    if (target.includes('/api/traits/popular')) {
      return mockFetchResponse([]);
    }
    return mockFetchResponse({});
  }) as unknown as typeof fetch;
};

import PeopleFilterScreen from '../people-filter';

describe('PeopleFilterScreen trait onboarding banner', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeAll(() => {
    const originalError = console.error;
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((message?: unknown, ...rest: unknown[]) => {
      if (typeof message === 'string' && message.includes('not wrapped in act')) {
        return;
      }
        originalError(message, ...rest);
      });
  });

  afterAll(() => {
    consoleErrorSpy?.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    installFetchMock();
    trackOnboardingEntry.mockClear();
    router.push.mockClear();
    __supabaseMock.setPledgeState({ ackAt: '2024-01-01T00:00:00.000Z', version: 'v1' });
    __supabaseMock.setSportProfile({
      primarySport: 'padel',
      playStyle: 'competitive',
      skillLevel: '3.5 - Consistent rallies',
    });
  });

  it('shows the CTA when fewer than five base traits exist', async () => {
    __supabaseMock.setBaseTraitCount(3);

    render(<PeopleFilterScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Finish onboarding')).toBeTruthy());
    expect(screen.getByText(/Add 2 more traits/i)).toBeTruthy();
  });

  it('hides the CTA once five traits are present', async () => {
    __supabaseMock.setBaseTraitCount(5);

    render(<PeopleFilterScreen />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.queryByText('Finish onboarding')).toBeNull();
    });
  });

  it('tracks analytics when the CTA is tapped', async () => {
    __supabaseMock.setBaseTraitCount(3);

    render(<PeopleFilterScreen />);
    await act(async () => {});

    const cta = await waitFor(() => screen.getByText('Choose traits'));
    fireEvent.press(cta);

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'people-filter-banner',
      platform: 'mobile',
      step: 'traits',
      steps: ['traits'],
      pendingSteps: 1,
      nextStep: '/onboarding-traits',
    });
    expect(router.push).toHaveBeenCalledWith('/onboarding-traits');
  });
});

describe('PeopleFilterScreen reliability pledge banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installFetchMock();
    trackOnboardingEntry.mockClear();
    router.push.mockClear();
    __supabaseMock.setSportProfile({
      primarySport: 'padel',
      playStyle: 'competitive',
      skillLevel: '3.5 - Consistent rallies',
    });
    __supabaseMock.setPledgeState({ ackAt: '2024-01-01T00:00:00.000Z', version: 'v1' });
  });

  it('shows the CTA when the pledge has not been acknowledged', async () => {
    __supabaseMock.setBaseTraitCount(5);
    __supabaseMock.setPledgeState({ ackAt: null, version: null });

    render(<PeopleFilterScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText(/forget the pledge/i)).toBeTruthy());
  });

  it('hides the CTA once the pledge is complete', async () => {
    __supabaseMock.setBaseTraitCount(5);
    __supabaseMock.setPledgeState({ ackAt: '2024-05-01T12:00:00.000Z', version: 'v2' });

    render(<PeopleFilterScreen />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.queryByText(/forget the pledge/i)).toBeNull();
    });
  });

  it('tracks analytics and routes when the CTA is tapped', async () => {
    __supabaseMock.setBaseTraitCount(5);
    __supabaseMock.setPledgeState({ ackAt: null, version: null });

    render(<PeopleFilterScreen />);
    await act(async () => {});

    const cta = await waitFor(() => screen.getByText('Review pledge'));
    fireEvent.press(cta);

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'people-filter-banner',
      platform: 'mobile',
      step: 'pledge',
      steps: ['pledge'],
      pendingSteps: 1,
      nextStep: '/onboarding/reliability-pledge',
    });
    expect(router.push).toHaveBeenCalledWith('/onboarding/reliability-pledge');
  });
});

describe('PeopleFilterScreen sport onboarding banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installFetchMock();
    trackOnboardingEntry.mockClear();
    router.push.mockClear();
    __supabaseMock.setPledgeState({ ackAt: '2024-01-01T00:00:00.000Z', version: 'v1' });
    __supabaseMock.setBaseTraitCount(5);
  });

  it('shows the CTA when sport data is incomplete', async () => {
    __supabaseMock.setSportProfile({ primarySport: null, playStyle: null, skillLevel: null });

    render(<PeopleFilterScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Set sport, play style, and level')).toBeTruthy());
    expect(screen.getByText('Update sport profile')).toBeTruthy();
  });

  it('tracks analytics when the CTA is tapped', async () => {
    __supabaseMock.setSportProfile({ primarySport: null, playStyle: null, skillLevel: null });

    render(<PeopleFilterScreen />);
    await act(async () => {});

    const cta = await waitFor(() => screen.getByText('Update sport profile'));
    fireEvent.press(cta);

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'people-filter-banner',
      platform: 'mobile',
      step: 'sport',
      steps: ['sport'],
      pendingSteps: 1,
      nextStep: '/onboarding/sports',
    });
    expect(router.push).toHaveBeenCalledWith('/onboarding/sports');
  });
});
