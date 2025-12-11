import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import type { SavePayload } from '@dowhat/shared';
import { SavedActivitiesProvider, useSavedActivities } from '../SavedActivitiesContext';

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    trackSavedActivityToggle: jest.fn(),
  } satisfies typeof import('@dowhat/shared');
});

jest.mock('../../lib/supabase', () => ({
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
    getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string } } }>>;
    onAuthStateChange: jest.MockedFunction<() => { data: { subscription: { unsubscribe: () => void } } }>;
  };
  from: jest.MockedFunction<(table: string) => unknown>;
};

const { supabase: mockSupabase } = jest.requireMock('../../lib/supabase') as { supabase: MockSupabase };
const { trackSavedActivityToggle } = jest.requireMock('@dowhat/shared') as {
  trackSavedActivityToggle: jest.Mock;
};

const selectRowsByTable: Record<string, Array<Record<string, unknown>>> = {
  user_saved_activities_view: [],
  saved_activities_view: [],
  saved_activities: [],
};

const selectErrorsByTable: Record<string, Error | null> = {
  user_saved_activities_view: null,
  saved_activities_view: null,
  saved_activities: null,
};

type SupabaseMutationResult = { error: Error | null };

const userSavedUpsert = jest.fn(async (): Promise<SupabaseMutationResult> => ({ error: null }));
const legacyUpsert = jest.fn(async (): Promise<SupabaseMutationResult> => ({ error: null }));
const userSavedDeleteMatch = jest.fn(async (): Promise<SupabaseMutationResult> => ({ error: null }));
const legacyDeleteMatch = jest.fn(async (): Promise<SupabaseMutationResult> => ({ error: null }));

type ContextValue = ReturnType<typeof useSavedActivities>;

const ContextProbe = ({ valueRef }: { valueRef: { current: ContextValue | null } }) => {
  const value = useSavedActivities();
  valueRef.current = value;
  return null;
};

describe('SavedActivitiesContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectRowsByTable.user_saved_activities_view = [];
    selectRowsByTable.saved_activities_view = [];
    selectRowsByTable.saved_activities = [];
    selectErrorsByTable.user_saved_activities_view = null;
    selectErrorsByTable.saved_activities_view = null;
    selectErrorsByTable.saved_activities = null;

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    });

    userSavedUpsert.mockResolvedValue({ error: null });
    legacyUpsert.mockResolvedValue({ error: null });
    userSavedDeleteMatch.mockResolvedValue({ error: null });
    legacyDeleteMatch.mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_saved_activities_view' || table === 'saved_activities_view') {
        return {
          select: () => ({
            eq: () => {
              const error = selectErrorsByTable[table];
              if (error) {
                return Promise.resolve({ data: null, error });
              }
              return Promise.resolve({ data: selectRowsByTable[table] ?? [], error: null });
            },
          }),
        };
      }
      if (table === 'user_saved_activities') {
        return {
          upsert: userSavedUpsert,
          delete: () => ({
            match: userSavedDeleteMatch,
          }),
        };
      }
      if (table === 'saved_activities') {
        return {
          select: () => ({
            eq: () => {
              const error = selectErrorsByTable[table];
              if (error) {
                return Promise.resolve({ data: null, error });
              }
              return Promise.resolve({ data: selectRowsByTable[table] ?? [], error: null });
            },
          }),
          upsert: legacyUpsert,
          delete: () => ({
            match: legacyDeleteMatch,
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  const renderContext = async () => {
    const valueRef: { current: ContextValue | null } = { current: null };

    render(
      <SavedActivitiesProvider>
        <ContextProbe valueRef={valueRef} />
      </SavedActivitiesProvider>,
    );

    await waitFor(() => {
      expect(valueRef.current).not.toBeNull();
    });
    await waitFor(() => {
      expect(valueRef.current?.loading).toBe(false);
    });

    return valueRef;
  };

  it('loads saved activities from Supabase views', async () => {
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-123',
        place_id: 'abc',
        place_name: 'Cafe ABC',
        place_address: '123 Street',
        city_slug: 'bangkok',
        sessions_count: 2,
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    const contextRef = await renderContext();

    expect(contextRef.current?.items).toHaveLength(1);
    expect(contextRef.current?.items[0]).toMatchObject({
      placeId: 'abc',
      name: 'Cafe ABC',
      address: '123 Street',
      citySlug: 'bangkok',
      sessionsCount: 2,
    });
    expect(contextRef.current?.isSaved('abc')).toBe(true);
  });

  it('optimistically adds saves using the preferred table', async () => {
    const payload: SavePayload = {
      id: 'venue-1',
      name: 'Venue One',
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
        user_id: 'user-123',
        place_id: 'venue-1',
        place_name: 'Venue One',
        place_address: 'Main Street',
        city_slug: 'chiang-mai',
        metadata: { source: 'test' },
      },
      { onConflict: 'user_id,place_id' },
    );
    expect(contextRef.current?.isSaved('venue-1')).toBe(true);
    expect(contextRef.current?.items[0]?.placeId).toBe('venue-1');
  });

  it('falls back to legacy tables when the primary write target is missing', async () => {
    userSavedUpsert.mockResolvedValueOnce({ error: new Error('relation user_saved_activities does not exist') });

    const contextRef = await renderContext();
    const payload: SavePayload = { id: 'legacy-1', name: 'Legacy Venue' };

    await act(async () => {
      await contextRef.current?.save(payload);
    });

    expect(userSavedUpsert).toHaveBeenCalled();
    expect(legacyUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-123',
        id: 'legacy-1',
        name: 'Legacy Venue',
      },
      { onConflict: 'user_id,id' },
    );
    expect(contextRef.current?.isSaved('legacy-1')).toBe(true);
  });

  it('falls back to the next read source when the primary select errors with a fallback-eligible message', async () => {
    selectErrorsByTable.user_saved_activities_view = new Error('relation user_saved_activities_view does not exist');
    selectRowsByTable.saved_activities_view = [
      {
        user_id: 'user-123',
        id: 'backup-venue',
        name: 'Backup Venue',
        sessions_count: 0,
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    ];

    const contextRef = await renderContext();
    expect(contextRef.current?.items).toHaveLength(1);
    expect(contextRef.current?.items[0]).toMatchObject({ placeId: 'backup-venue', name: 'Backup Venue' });
    expect(contextRef.current?.error).toBeNull();

    await act(async () => {
      await contextRef.current?.save({ id: 'backup-venue', name: 'Backup Venue' });
    });

    expect(legacyUpsert).toHaveBeenCalledTimes(1);
    expect(userSavedUpsert).not.toHaveBeenCalled();
  });

  it('unsaves existing items via toggle', async () => {
    selectRowsByTable.user_saved_activities_view = [
      {
        user_id: 'user-123',
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

    expect(userSavedDeleteMatch).toHaveBeenCalledWith({
      user_id: 'user-123',
      place_id: 'alpha',
    });
    expect(contextRef.current?.isSaved('alpha')).toBe(false);
    expect(contextRef.current?.items).toHaveLength(0);
  });

  it('fires analytics events when toggling saves', async () => {
    const contextRef = await renderContext();
    const payload: SavePayload = {
      id: 'mobile-telemetry',
      name: 'Telemetry Venue',
      citySlug: 'chiang-mai',
      metadata: { source: 'home_card' },
    };

    await act(async () => {
      await contextRef.current?.toggle(payload);
    });

    expect(trackSavedActivityToggle).toHaveBeenLastCalledWith({
      platform: 'mobile',
      action: 'save',
      placeId: 'mobile-telemetry',
      name: 'Telemetry Venue',
      citySlug: 'chiang-mai',
      venueId: null,
      source: 'home_card',
    });

    await act(async () => {
      await contextRef.current?.toggle(payload);
    });

    expect(trackSavedActivityToggle).toHaveBeenLastCalledWith({
      platform: 'mobile',
      action: 'unsave',
      placeId: 'mobile-telemetry',
      name: 'Telemetry Venue',
      citySlug: 'chiang-mai',
      venueId: null,
      source: 'home_card',
    });
  });
});
