import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('../../lib/supabase', () => {
  const state: {
    userId: string | null;
    coreValues: string[] | null;
    coreValuesPreference: string[] | null;
    profileSelectError: { message: string; code?: string } | null;
    upsertCallCount: number;
    profileUpsertPayloads: Record<string, unknown>[];
    preferenceUpsertPayloads: Record<string, unknown>[];
    firstUpsertError: { message: string } | null;
    secondUpsertError: { message: string } | null;
  } = {
    userId: 'user-123',
    coreValues: [],
    coreValuesPreference: null,
    profileSelectError: null,
    upsertCallCount: 0,
    profileUpsertPayloads: [],
    preferenceUpsertPayloads: [],
    firstUpsertError: null,
    secondUpsertError: null,
  };

  const auth = {
    getUser: jest.fn(async () => ({ data: { user: state.userId ? { id: state.userId } : null } })),
  };

  const createProfilesBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: { core_values: state.coreValues }, error: state.profileSelectError }));
    builder.upsert = jest.fn(async (payload: Record<string, unknown>) => {
      state.upsertCallCount += 1;
      state.profileUpsertPayloads.push(payload);
      if (state.upsertCallCount === 1) return { error: state.firstUpsertError };
      return { error: state.secondUpsertError };
    });
    return builder;
  };

  const createUserPreferencesBuilder = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: { value: state.coreValuesPreference }, error: null }));
    builder.upsert = jest.fn(async (payload: Record<string, unknown>) => {
      state.preferenceUpsertPayloads.push(payload);
      return { error: null };
    });
    return builder;
  };

  const helpers = {
    reset: () => {
      state.userId = 'user-123';
      state.coreValues = [];
      state.coreValuesPreference = null;
      state.profileSelectError = null;
      state.upsertCallCount = 0;
      state.profileUpsertPayloads = [];
      state.preferenceUpsertPayloads = [];
      state.firstUpsertError = null;
      state.secondUpsertError = null;
      auth.getUser.mockClear();
    },
    setProfileSelectError: (error: { message: string; code?: string } | null) => {
      state.profileSelectError = error;
    },
    setCoreValuesPreference: (values: string[] | null) => {
      state.coreValuesPreference = values;
    },
    setUpsertErrors: (first: { message: string } | null, second: { message: string } | null) => {
      state.firstUpsertError = first;
      state.secondUpsertError = second;
    },
    getProfileUpsertPayloads: () => state.profileUpsertPayloads,
    getPreferenceUpsertPayloads: () => state.preferenceUpsertPayloads,
  };

  return {
    supabase: {
      auth,
      from: jest.fn((table: string) => {
        if (table === 'profiles') return createProfilesBuilder();
        if (table === 'user_preferences') return createUserPreferencesBuilder();
        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    __supabaseMock: helpers,
  };
});

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    reset: () => void;
    setProfileSelectError: (error: { message: string; code?: string } | null) => void;
    setCoreValuesPreference: (values: string[] | null) => void;
    setUpsertErrors: (first: { message: string } | null, second: { message: string } | null) => void;
    getProfileUpsertPayloads: () => Array<Record<string, unknown>>;
    getPreferenceUpsertPayloads: () => Array<Record<string, unknown>>;
  };
};

describe('OnboardingCoreValuesScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    __supabaseMock.reset();
  });

  it('retries save without user_id when profiles.user_id is missing', async () => {
    __supabaseMock.setUpsertErrors(
      { message: 'column "user_id" of relation "profiles" does not exist' },
      null,
    );

    const { getByPlaceholderText, getByText } = render(<CoreValuesScreen />);

    await waitFor(() => expect(getByPlaceholderText('Value 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Value 1'), 'Community');
    fireEvent.changeText(getByPlaceholderText('Value 2'), 'Cats');
    fireEvent.changeText(getByPlaceholderText('Value 3'), 'Loyalty');
    fireEvent.press(getByText('Save values and continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/reliability-pledge'));

    const payloads = __supabaseMock.getProfileUpsertPayloads();
    expect(payloads.length).toBe(2);
    expect(payloads[0]).toEqual(expect.objectContaining({ id: 'user-123', user_id: 'user-123' }));
    expect(payloads[1]).toEqual(expect.objectContaining({ id: 'user-123' }));
    expect(payloads[1]).not.toHaveProperty('user_id');
  });

  it('saves to user_preferences when profiles.core_values column is missing', async () => {
    __supabaseMock.setUpsertErrors(
      { message: 'column "core_values" of relation "profiles" does not exist' },
      null,
    );

    const { getByPlaceholderText, getByText } = render(<CoreValuesScreen />);

    await waitFor(() => expect(getByPlaceholderText('Value 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Value 1'), 'Community');
    fireEvent.changeText(getByPlaceholderText('Value 2'), 'Cats');
    fireEvent.changeText(getByPlaceholderText('Value 3'), 'Loyalty');
    fireEvent.press(getByText('Save values and continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/reliability-pledge'));

    const preferencePayloads = __supabaseMock.getPreferenceUpsertPayloads();
    expect(preferencePayloads.length).toBe(1);
    expect(preferencePayloads[0]).toEqual(expect.objectContaining({
      user_id: 'user-123',
      key: 'onboarding_core_values',
      value: ['Community', 'Cats', 'Loyalty'],
    }));
  });

  it('loads fallback values from user_preferences when profiles.core_values is missing', async () => {
    __supabaseMock.setProfileSelectError({ message: 'column "core_values" does not exist' });
    __supabaseMock.setCoreValuesPreference(['Community', 'Cats', 'Loyalty']);

    const { getByDisplayValue } = render(<CoreValuesScreen />);

    await waitFor(() => expect(getByDisplayValue('Community')).toBeTruthy());
    expect(getByDisplayValue('Cats')).toBeTruthy();
    expect(getByDisplayValue('Loyalty')).toBeTruthy();
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CoreValuesScreen = require('../onboarding/core-values').default as typeof import('../onboarding/core-values').default;
