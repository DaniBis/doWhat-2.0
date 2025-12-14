import React from 'react';
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SportsOnboardingScreen from '../onboarding/sports';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

jest.mock('../../lib/supabase', () => {
  const state: {
    userId: string;
    profile: { primary_sport: string | null; play_style: string | null };
    sportProfile: { skill_level: string | null };
  } = {
    userId: 'user-123',
    profile: { primary_sport: null, play_style: null },
    sportProfile: { skill_level: null },
  };

  const buildProfilesBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: state.profile, error: null }));
    builder.upsert = jest.fn(async () => ({ error: null }));
    return builder;
  };

  const buildSportProfilesBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: state.sportProfile, error: null }));
    builder.upsert = jest.fn(async () => ({ error: null }));
    return builder;
  };

  const auth = {
    getUser: jest.fn(async () => ({ data: { user: { id: state.userId } } })),
  };

  return {
    supabase: {
      auth,
      from: jest.fn((table: string) => {
        if (table === 'profiles') return buildProfilesBuilder();
        if (table === 'user_sport_profiles') return buildSportProfilesBuilder();
        throw new Error(`Unexpected table ${table}`);
      }),
    },
    __supabaseMock: {
      reset: () => {
        state.userId = 'user-123';
        state.profile = { primary_sport: null, play_style: null };
        state.sportProfile = { skill_level: null };
        auth.getUser.mockClear();
      },
      setProfileRow: (row: { primary_sport: string | null; play_style: string | null }) => {
        state.profile = row;
      },
      setSportProfileRow: (row: { skill_level: string | null }) => {
        state.sportProfile = row;
      },
    },
  };
});

const { trackOnboardingEntry } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
};

const sharedModule = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
const DEFAULT_PADEL_SKILL = sharedModule.getSkillLabels('padel')[0] ?? '1.0 - New to the sport';
const COMPETITIVE_LABEL = sharedModule.getPlayStyleLabel('competitive');

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    reset: () => void;
  };
};

const replaceSpy = router.replace as jest.Mock;

describe('SportsOnboardingScreen', () => {
  beforeEach(() => {
    __supabaseMock.reset();
    trackOnboardingEntry.mockClear();
    replaceSpy.mockClear();
  });

  it('tracks analytics when sport onboarding saves successfully', async () => {
    const screen = render(<SportsOnboardingScreen />);
    await act(async () => {});
    const { findByText, getByText } = screen;

    fireEvent.press(await findByText('Padel'));
    fireEvent.press(await findByText(DEFAULT_PADEL_SKILL));
    fireEvent.press(await findByText(COMPETITIVE_LABEL));

    fireEvent.press(getByText('Save and continue'));

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/onboarding/reliability-pledge'));
    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'sport-selector',
      platform: 'mobile',
      step: 'pledge',
      steps: ['pledge'],
      pendingSteps: 1,
      nextStep: '/onboarding/reliability-pledge',
    });
  });

  it('keeps the save CTA disabled until sport, skill, and play style are selected', async () => {
    const screen = render(<SportsOnboardingScreen />);
    await act(async () => {});
    const { findByText, getByTestId } = screen;
    const getCta = () => getByTestId('sport-onboarding-save');

    expect(getCta().props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(await findByText('Padel'));
    expect(getCta().props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(await findByText(DEFAULT_PADEL_SKILL));
    expect(getCta().props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(await findByText(COMPETITIVE_LABEL));
    expect(getCta().props.accessibilityState?.disabled).toBe(false);
  });
});
