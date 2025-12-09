import React from 'react';
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { Mock } from 'jest-mock';
import { router } from 'expo-router';

type TraitRow = { id: string; name: string; color?: string | null; icon?: string | null };

jest.mock('../../lib/supabase', () => {
  const supabaseState: {
    traitCatalog: TraitRow[];
    baseTraits: string[];
    userId: string;
    lastInsertPayload: Array<{ user_id: string; trait_id: string }>;
  } = {
    traitCatalog: [],
    baseTraits: [],
    userId: 'user-123',
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
      throw new Error(`Unexpected table ${table}`);
    }),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: supabaseState.userId ? { id: supabaseState.userId } : null } })),
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
    reset: () => {
      supabaseState.traitCatalog = [];
      supabaseState.baseTraits = [];
      supabaseState.userId = 'user-123';
      supabaseState.lastInsertPayload = [];
      mockSupabaseClient.from.mockClear();
      mockSupabaseClient.auth.getUser.mockClear();
      mockSupabaseClient.rpc.mockClear();
    },
    getLastInsertPayload: () => supabaseState.lastInsertPayload,
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
    reset: () => void;
    getLastInsertPayload: () => Array<{ user_id: string; trait_id: string }>;
    mockClient: {
      from: Mock;
      auth: { getUser: Mock };
      rpc: Mock;
    };
  };
};

const { setTraitCatalog, setBaseTraits, reset: resetSupabaseState, getLastInsertPayload, mockClient: mockSupabaseClient } =
  __supabaseMock;

// Import after mocking supabase so the screen picks up the stub client
import TraitSelectionScreen from '../onboarding-traits';

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
    jest.clearAllMocks();
  });

  it('enforces the five-trait selection limit before enabling save', async () => {
    const { getByText, findByTestId } = render(<TraitSelectionScreen />);

    await waitFor(() => expect(getByText('Choose 5 traits that describe you')).toBeTruthy());

    const saveButton = getByText('Save traits');
    expect(saveButton).toBeDisabled();

    for (let i = 1; i <= 5; i += 1) {
      const traitCard = await findByTestId(`trait-card-trait-${i}`);
      fireEvent.press(traitCard);
    }

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(getByText('All set! Save to continue.')).toBeTruthy();

    const extraTrait = await findByTestId('trait-card-trait-6');
    fireEvent.press(extraTrait);
    expect(getByText('5 / 5 selected')).toBeTruthy();
  });

  it('persists selections and navigates home once saved', async () => {
    const { findByTestId, getByText } = render(<TraitSelectionScreen />);

    for (let i = 1; i <= 5; i += 1) {
      const traitCard = await findByTestId(`trait-card-trait-${i}`);
      fireEvent.press(traitCard);
    }

    fireEvent.press(getByText('Save traits'));

    await waitFor(() => expect(getLastInsertPayload().length).toBe(5));

    const expectedPayload = Array.from({ length: 5 }, (_, index) => ({
      user_id: 'user-123',
      trait_id: `trait-${index + 1}`,
    }));
    expect(getLastInsertPayload()).toEqual(expectedPayload);

    expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(6);
    expect(mockSupabaseClient.rpc.mock.calls[0]?.[0]).toBe('ensure_public_user_row');
    const incrementCalls = mockSupabaseClient.rpc.mock.calls.slice(1);
    incrementCalls.forEach(([fn]) => expect(fn).toBe('increment_user_trait_score'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
  });
});
