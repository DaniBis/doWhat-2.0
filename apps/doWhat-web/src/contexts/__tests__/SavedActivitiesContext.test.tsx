import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { SavePayload } from '@dowhat/shared';
import type { PostgrestError } from '@supabase/supabase-js';
import { SavedActivitiesProvider, useSavedActivities } from '../SavedActivitiesContext';

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}));

type MockSupabase = {
  auth: {
    getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string } | null } }>>;
    onAuthStateChange: jest.MockedFunction<
      (
        handler: (event: string, session: { user: { id: string } | null } | null) => void,
      ) => { data: { subscription: { unsubscribe: () => void } } }
    >;
  };
  from: jest.MockedFunction<(table: string) => any>;
};

const { supabase: mockSupabase } = jest.requireMock('@/lib/supabase/browser') as { supabase: MockSupabase };

const selectRowsByTable: Record<string, Array<Record<string, unknown>>> = {
  user_saved_activities_view: [],
  saved_activities_view: [],
  saved_activities: [],
};

type MutationResponse = { error: PostgrestError | null };
const createMutationMock = () => jest.fn<Promise<MutationResponse>, any[]>(async () => ({ error: null }));

const userSavedUpsert = createMutationMock();
const legacyUpsert = createMutationMock();
const userSavedDelete = createMutationMock();
const legacyDelete = createMutationMock();

type ContextValue = ReturnType<typeof useSavedActivities>;

const ContextProbe = ({ valueRef }: { valueRef: { current: ContextValue | null } }) => {
  const value = useSavedActivities();
  valueRef.current = value;
  return null;
};

const serializeContext = (value: ContextValue | null) => {
  if (!value) return null;
  return {
    loading: value.loading,
    refreshing: value.refreshing,
    error: value.error,
    items: value.items,
    savedIds: Array.from(value.savedIds).sort(),
    pendingIds: Array.from(value.pendingIds).sort(),
  };
};

const buildSelect = (table: string) => ({
  eq: () => Promise.resolve({ data: selectRowsByTable[table] ?? [], error: null }),
});

beforeEach(() => {
  jest.clearAllMocks();
  selectRowsByTable.user_saved_activities_view = [];
  selectRowsByTable.saved_activities_view = [];
  selectRowsByTable.saved_activities = [];

  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-web-1' } } });
  mockSupabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });

  userSavedUpsert.mockResolvedValue({ error: null });
  legacyUpsert.mockResolvedValue({ error: null });
  userSavedDelete.mockResolvedValue({ error: null });
  legacyDelete.mockResolvedValue({ error: null });

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'user_saved_activities_view' || table === 'saved_activities_view') {
      return {
        select: () => buildSelect(table),
      };
    }
    if (table === 'saved_activities') {
      return {
        select: () => buildSelect(table),
        upsert: legacyUpsert,
        delete: () => ({
          match: legacyDelete,
        }),
      };
    }
    if (table === 'user_saved_activities') {
      return {
        upsert: userSavedUpsert,
        delete: () => ({
          match: userSavedDelete,
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
});

const renderContext = async () => {
  const valueRef: { current: ContextValue | null } = { current: null };

  render(
    <SavedActivitiesProvider>
      <ContextProbe valueRef={valueRef} />
    </SavedActivitiesProvider>,
  );

  await waitFor(() => expect(valueRef.current).not.toBeNull());
  await waitFor(() => expect(valueRef.current?.loading).toBe(false));

  return valueRef;
};

describe('SavedActivitiesContext (web)', () => {
  it('loads saved activities from Supabase views', async () => {
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-web-1',
        place_id: 'spot-1',
        place_name: 'Hidden Bar',
        place_address: '123 Lane',
        city_slug: 'bangkok',
        sessions_count: 4,
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    const contextRef = await renderContext();

    expect(contextRef.current?.items).toHaveLength(1);
    expect(contextRef.current?.items[0]).toMatchObject({
      placeId: 'spot-1',
      name: 'Hidden Bar',
      address: '123 Lane',
      citySlug: 'bangkok',
    });
    expect(contextRef.current?.isSaved('spot-1')).toBe(true);
  });

  it('matches snapshot after loading data', async () => {
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-web-1',
        place_id: 'spot-1',
        place_name: 'Hidden Bar',
        place_address: '123 Lane',
        city_slug: 'bangkok',
        sessions_count: 4,
        updated_at: '2024-01-01T00:00:00.000Z',
        metadata: { source: 'seed', venueId: 'venue-1' },
      },
      {
        user_id: 'user-web-1',
        place_id: 'spot-2',
        place_name: 'Cozy Cafe',
        place_address: '456 Road',
        city_slug: 'chiang-mai',
        sessions_count: 0,
        updated_at: '2024-01-02T00:00:00.000Z',
        metadata: null,
      },
    ];

    const contextRef = await renderContext();
    expect(serializeContext(contextRef.current)).toMatchInlineSnapshot(`
      {
        "error": null,
        "items": [
          {
            "address": "123 Lane",
            "citySlug": "bangkok",
            "metadata": {
              "source": "seed",
              "venueId": "venue-1",
            },
            "name": "Hidden Bar",
            "placeId": "spot-1",
            "sessionsCount": 4,
            "updatedAt": "2024-01-01T00:00:00.000Z",
            "venueId": null,
          },
          {
            "address": "456 Road",
            "citySlug": "chiang-mai",
            "metadata": null,
            "name": "Cozy Cafe",
            "placeId": "spot-2",
            "sessionsCount": 0,
            "updatedAt": "2024-01-02T00:00:00.000Z",
            "venueId": null,
          },
        ],
        "loading": false,
        "pendingIds": [],
        "refreshing": false,
        "savedIds": [
          "spot-1",
          "spot-2",
        ],
      }
    `);
  });

  it('optimistically saves new items using the preferred table', async () => {
    const payload: SavePayload = {
      id: 'venue-9',
      name: 'Venue Nine',
      address: 'Main Street',
      citySlug: 'chiang-mai',
      metadata: { source: 'test' },
    };

    const contextRef = await renderContext();

    await act(async () => {
      await contextRef.current?.save(payload);
    });

    expect(userSavedUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-web-1',
        place_id: 'venue-9',
        place_name: 'Venue Nine',
        place_address: 'Main Street',
        city_slug: 'chiang-mai',
        metadata: { source: 'test' },
      },
      { onConflict: 'user_id,place_id' },
    );
    expect(contextRef.current?.isSaved('venue-9')).toBe(true);
  });

  it('falls back when the primary write target errors', async () => {
    const missingTableError: PostgrestError = {
      name: 'PostgrestError',
      message: 'relation user_saved_activities does not exist',
      details: '',
      hint: '',
      code: '42P01',
    };
    userSavedUpsert.mockResolvedValueOnce({ error: missingTableError });

    const contextRef = await renderContext();
    const payload: SavePayload = { id: 'legacy-9', name: 'Legacy Venue' };

    await act(async () => {
      await contextRef.current?.save(payload);
    });

    expect(userSavedUpsert).toHaveBeenCalled();
    expect(legacyUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-web-1',
        id: 'legacy-9',
        name: 'Legacy Venue',
      },
      { onConflict: 'user_id,id' },
    );
    expect(contextRef.current?.isSaved('legacy-9')).toBe(true);
  });

  it('unsaves items via toggle when already saved', async () => {
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-web-1',
        place_id: 'alpha',
        place_name: 'Alpha',
        place_address: 'Lane 1',
        city_slug: 'phuket',
        sessions_count: 0,
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    const contextRef = await renderContext();
    expect(contextRef.current?.isSaved('alpha')).toBe(true);

    await act(async () => {
      await contextRef.current?.toggle({ id: 'alpha', name: 'Alpha' });
    });

    expect(userSavedDelete).toHaveBeenCalledWith({
      user_id: 'user-web-1',
      place_id: 'alpha',
    });
    expect(contextRef.current?.isSaved('alpha')).toBe(false);
    expect(contextRef.current?.items).toHaveLength(0);
  });

  it('clears state when refresh runs without a signed-in user', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-web-1' } } });
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-web-1',
        place_id: 'alpha',
        place_name: 'Alpha',
        place_address: 'Lane 1',
        city_slug: 'phuket',
        sessions_count: 1,
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    const contextRef = await renderContext();
    expect(contextRef.current?.items).toHaveLength(1);

    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const authChangeHandler = mockSupabase.auth.onAuthStateChange.mock.calls[0]?.[0];
    expect(authChangeHandler).toBeDefined();
    await act(async () => {
      authChangeHandler?.('SIGNED_OUT', { user: null } as any);
    });

    await act(async () => {
      await contextRef.current?.refresh();
    });

    expect(contextRef.current?.items).toHaveLength(0);
    expect(contextRef.current?.error).toBeNull();
    expect(serializeContext(contextRef.current)).toMatchInlineSnapshot(`
      {
        "error": null,
        "items": [],
        "loading": false,
        "pendingIds": [],
        "refreshing": false,
        "savedIds": [],
      }
    `);
  });
});
