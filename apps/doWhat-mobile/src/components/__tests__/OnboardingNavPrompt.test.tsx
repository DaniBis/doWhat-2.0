import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import OnboardingNavPrompt from '../OnboardingNavPrompt';

type ProfileRow = {
  primary_sport: string | null;
  play_style: string | null;
  reliability_pledge_ack_at: string | null;
};

type SportProfileRow = { skill_level: string | null };

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Link: ({ children, onPress }: { children: React.ReactElement; onPress?: () => void }) =>
      React.cloneElement(children, {
        onPress: (...args: unknown[]) => {
          if (typeof onPress === 'function') {
            onPress(...(args as []));
          }
          if (typeof children.props?.onPress === 'function') {
            children.props.onPress(...(args as []));
          }
        },
      }),
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

jest.mock('../../lib/supabase', () => {
  const state = {
    user: { id: 'user-1' } as { id: string } | null,
    traitCount: 0,
    profile: { primary_sport: null, play_style: null, reliability_pledge_ack_at: null } as ProfileRow,
    sportProfile: { skill_level: null } as SportProfileRow,
  };

  const buildTraitCountBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(async () => ({ count: state.traitCount, error: null }));
    return builder;
  };

  const buildProfilesBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: state.profile, error: null }));
    return builder;
  };

  const buildSportProfileBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: state.sportProfile, error: null }));
    return builder;
  };

  const auth = {
    getUser: jest.fn(async () => ({ data: { user: state.user } })),
  };

  return {
    supabase: {
      auth,
      from: jest.fn((table: string) => {
        if (table === 'user_base_traits') return buildTraitCountBuilder();
        if (table === 'profiles') return buildProfilesBuilder();
        if (table === 'user_sport_profiles') return buildSportProfileBuilder();
        throw new Error(`Unexpected table ${table}`);
      }),
    },
    __supabaseMock: {
      reset: () => {
        state.user = { id: 'user-1' };
        state.traitCount = 0;
        state.profile = { primary_sport: null, play_style: null, reliability_pledge_ack_at: null };
        state.sportProfile = { skill_level: null };
        auth.getUser.mockClear();
      },
      setTraitCount: (count: number) => {
        state.traitCount = count;
      },
      setProfileRow: (row: ProfileRow) => {
        state.profile = row;
      },
      setSportProfileRow: (row: SportProfileRow) => {
        state.sportProfile = row;
      },
      setUser: (user: { id: string } | null) => {
        state.user = user;
      },
      auth,
    },
  };
});

const { trackOnboardingEntry } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
};

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    reset: () => void;
    setTraitCount: (count: number) => void;
    setProfileRow: (row: ProfileRow) => void;
    setSportProfileRow: (row: SportProfileRow) => void;
    setUser: (user: { id: string } | null) => void;
    auth: { getUser: jest.Mock };
  };
};

describe('OnboardingNavPrompt', () => {
  beforeEach(() => {
    __supabaseMock.reset();
    trackOnboardingEntry.mockClear();
  });

  it('renders an actionable CTA when onboarding steps remain', async () => {
    __supabaseMock.setTraitCount(2);

    render(<OnboardingNavPrompt />);
    await act(async () => {});
    await waitFor(() => expect(screen.getByTestId('onboarding-nav-card')).toBeTruthy());

    expect(screen.getByText('Finish onboarding')).toBeTruthy();
    expect(screen.getByText(/Next up: Pick 5 base traits/i)).toBeTruthy();
    expect(screen.getAllByText(/Pick 5 base traits/i).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('onboarding-nav-cta'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'onboarding-nav-mobile',
      platform: 'mobile',
      step: 'traits',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding-traits',
    });
  });

  it('stays hidden when onboarding is complete', async () => {
    __supabaseMock.setTraitCount(5);
    __supabaseMock.setProfileRow({
      primary_sport: 'padel',
      play_style: 'competitive',
      reliability_pledge_ack_at: '2025-12-10T00:00:00.000Z',
    });
    __supabaseMock.setSportProfileRow({ skill_level: '3.0 - Consistent drives' });

    render(<OnboardingNavPrompt />);
    await act(async () => {});
    await waitFor(() => expect(__supabaseMock.auth.getUser).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-nav-card')).toBeNull();
    });
  });
});
