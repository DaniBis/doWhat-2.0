import React from 'react';
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { Mock } from 'jest-mock';
import { router } from 'expo-router';

type TraitRow = { id: string; name: string; color?: string | null; icon?: string | null };

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

jest.mock('../../lib/supabase', () => {
  const supabaseState: {
    traitCatalog: TraitRow[];
    baseTraits: string[];
    userId: string;
    userEmail: string;
    lastInsertPayload: Array<{ user_id: string; trait_id: string }>;
  } = {
    traitCatalog: [],
    baseTraits: [],
    userId: 'user-123',
    userEmail: 'user@example.com',
    lastInsertPayload: [],
  };

  const buildTraitsSelectResult = () => ({
    order: jest.fn(async () => ({ data: supabaseState.traitCatalog, error: null })),
    in: jest.fn(async (_col: string, ids: string[]) => ({
      data: supabaseState.traitCatalog
        .filter((trait) => ids.includes(trait.id))
        .map((trait) => ({ id: trait.id })),
      error: null,
    })),
  });

  const buildBaseSelectResult = () => ({
    eq: jest.fn(async () => ({
      data: supabaseState.baseTraits.map((traitId) => ({ trait_id: traitId })),
      error: null,
    })),
  });

  const buildDeleteResult = () => ({
    eq: jest.fn(async () => ({ error: null })),
  });

  const usersUpsert = jest.fn(async () => ({ error: null }));

  const mockSupabaseClient = {
    from: jest.fn((table: string) => {
      if (table === 'traits') {
        return {
          select: jest.fn(() => buildTraitsSelectResult()),
        };
      }
      if (table === 'user_base_traits') {
        return {
          select: jest.fn(() => buildBaseSelectResult()),
          delete: jest.fn(() => buildDeleteResult()),
          insert: jest.fn(async (payload: Array<{ user_id: string; trait_id: string }>) => {
            supabaseState.lastInsertPayload = payload;
            return { error: null };
          }),
        };
      }
      if (table === 'users') {
        return {
          upsert: usersUpsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({
          data: {
            user: supabaseState.userId
              ? {
                  id: supabaseState.userId,
                  email: supabaseState.userEmail,
                  user_metadata: {},
                }
              : null,
          },
        }),
      ),
    },
    rpc: jest.fn(() => Promise.resolve({ error: null })),
  };

  const helpers = {
    setTraitCatalog: (traits: TraitRow[]) => {
      supabaseState.traitCatalog = traits;
    },
    setBaseTraits: (traits: string[]) => {
      supabaseState.baseTraits = traits;
    },
    setUserId: (userId: string | null) => {
      supabaseState.userId = userId ?? '';
    },
    setUserEmail: (email: string) => {
      supabaseState.userEmail = email;
    },
    reset: () => {
      supabaseState.traitCatalog = [];
      supabaseState.baseTraits = [];
      supabaseState.userId = 'user-123';
      supabaseState.userEmail = 'user@example.com';
      supabaseState.lastInsertPayload = [];
      mockSupabaseClient.from.mockClear();
      mockSupabaseClient.auth.getUser.mockClear();
      mockSupabaseClient.rpc.mockClear();
      usersUpsert.mockClear();
    },
    getLastInsertPayload: () => supabaseState.lastInsertPayload,
    getUsersUpsertCalls: () => usersUpsert.mock.calls,
    mockClient: mockSupabaseClient,
  };

  return {
    supabase: mockSupabaseClient,
    __supabaseMock: helpers,
  };
});

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    setTraitCatalog: (traits: TraitRow[]) => void;
    setBaseTraits: (traits: string[]) => void;
    setUserId: (userId: string | null) => void;
    setUserEmail: (email: string) => void;
    reset: () => void;
    getLastInsertPayload: () => Array<{ user_id: string; trait_id: string }>;
    getUsersUpsertCalls: () => unknown[][];
    mockClient: {
      from: Mock;
      auth: { getUser: Mock };
      rpc: Mock;
    };
  };
};

const { setTraitCatalog, setBaseTraits, setUserId, reset: resetSupabaseState, getLastInsertPayload, getUsersUpsertCalls, mockClient: mockSupabaseClient } =
  __supabaseMock;

// Import after mocking supabase so the screen picks up the stub client
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TraitSelectionScreen = require('../onboarding-traits').default as typeof import('../onboarding-traits').default;

const replaceSpy = router.replace as Mock;

const buildTraits = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `trait-${index + 1}`,
    name: `Trait ${index + 1}`,
    color: '#34D399',
    icon: 'Sparkles',
  }));

describe('TraitSelectionScreen', () => {
  beforeEach(() => {
    resetSupabaseState();
    setTraitCatalog(buildTraits(6));
    setBaseTraits([]);
    replaceSpy.mockReset();
  });

  it('enforces the five-trait selection limit before enabling save', async () => {
    const { getByText, getByTestId } = render(<TraitSelectionScreen />);

    await waitFor(() => expect(getByText('Choose 5 traits that describe you')).toBeTruthy());
    await waitFor(() => expect(getByTestId('trait-card-trait-1')).toBeTruthy());

    const saveButton = getByTestId('trait-onboarding-save-button');
    expect(saveButton).toBeDisabled();

    for (let i = 1; i <= 5; i += 1) {
      fireEvent.press(getByTestId(`trait-card-trait-${i}`));
    }

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(getByText('All set! Save to continue.')).toBeTruthy();

    fireEvent.press(getByTestId('trait-card-trait-6'));
    expect(getByText('5 / 5 selected')).toBeTruthy();
  });

  it('persists selections and navigates home once saved', async () => {
    const { getByTestId } = render(<TraitSelectionScreen />);

    await waitFor(() => expect(getByTestId('trait-card-trait-1')).toBeTruthy());

    for (let i = 1; i <= 5; i += 1) {
      fireEvent.press(getByTestId(`trait-card-trait-${i}`));
    }

    fireEvent.press(getByTestId('trait-onboarding-save-button'));

    await waitFor(() => expect(getLastInsertPayload().length).toBe(5));

    const expectedPayload = Array.from({ length: 5 }, (_, index) => ({
      user_id: 'user-123',
      trait_id: `trait-${index + 1}`,
    }));
    expect(getLastInsertPayload()).toEqual(expectedPayload);

    const incrementCalls = mockSupabaseClient.rpc.mock.calls.filter(([fn]) => fn === 'increment_user_trait_score');
    expect(incrementCalls).toHaveLength(5);
    mockSupabaseClient.rpc.mock.calls.forEach(([fn]) => expect(fn).toBe('increment_user_trait_score'));

    const upsertCalls = getUsersUpsertCalls();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.[0]).toMatchObject({ id: 'user-123', email: 'user@example.com' });

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/(tabs)'));
  });

  it('surfaces an auth error when no user session is present', async () => {
    setUserId(null);
    const { getByTestId, getByText } = render(<TraitSelectionScreen />);

    await waitFor(() => expect(getByTestId('trait-card-trait-1')).toBeTruthy());

    for (let i = 1; i <= 5; i += 1) {
      fireEvent.press(getByTestId(`trait-card-trait-${i}`));
    }

    fireEvent.press(getByTestId('trait-onboarding-save-button'));

    await waitFor(() => expect(getByText('Please sign in again.')).toBeTruthy());
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
