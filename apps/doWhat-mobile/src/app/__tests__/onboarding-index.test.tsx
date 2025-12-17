import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import OnboardingHomeScreen from '../onboarding/index';

type ProfileRow = {
  primary_sport: string | null;
  play_style: string | null;
  reliability_pledge_ack_at: string | null;
};

type SportProfileRow = { skill_level: string | null };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
  type MockUser = { id: string } | null;
  const state: {
    user: MockUser;
    traitCount: number;
    profile: ProfileRow;
    sportProfile: SportProfileRow;
  } = {
    user: { id: 'user-1' },
    traitCount: 0,
    profile: { primary_sport: null, play_style: null, reliability_pledge_ack_at: null },
    sportProfile: { skill_level: null },
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
      setUser: (user: MockUser) => {
        state.user = user;
      },
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
  };
};

describe('OnboardingHomeScreen', () => {
  beforeEach(() => {
    __supabaseMock.reset();
    trackOnboardingEntry.mockClear();
  });

  it('shows pending steps and tracks the prioritized CTA', async () => {
    __supabaseMock.setTraitCount(2);

    render(<OnboardingHomeScreen />);
    await act(async () => {});
    await waitFor(() => expect(screen.getByText('Go to next step')).toBeTruthy());

    expect(screen.getByText('Finish the Step 0 checklist')).toBeTruthy();
    expect(screen.getByText('2/5 vibes saved')).toBeTruthy();
    expect(screen.getByText(/Sport or skill missing/i)).toBeTruthy();
    expect(screen.getByText(/Pledge pending/i)).toBeTruthy();
    expect(screen.getByText(/Next up: Pick 5 base traits/i)).toBeTruthy();

    fireEvent.press(screen.getByText('Go to next step'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'onboarding-summary-mobile',
      platform: 'mobile',
      step: 'traits',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding-traits',
    });
  });

  it('marks steps complete and swaps the CTA once onboarding is finished', async () => {
    __supabaseMock.setTraitCount(5);
    __supabaseMock.setProfileRow({
      primary_sport: 'padel',
      play_style: 'competitive',
      reliability_pledge_ack_at: '2025-12-10T00:00:00.000Z',
    });
    __supabaseMock.setSportProfileRow({ skill_level: '3.0 - Consistent drives' });

    render(<OnboardingHomeScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Return to Home')).toBeTruthy());
    expect(screen.queryByText(/Next up:/i)).toBeNull();
    expect(screen.getAllByText('Review step').length).toBe(3);

    fireEvent.press(screen.getByText('Return to Home'));
    expect(trackOnboardingEntry).not.toHaveBeenCalled();
  });
});
