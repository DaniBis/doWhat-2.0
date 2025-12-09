import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
	READ_SOURCES,
	WRITE_TARGETS,
	cleanRecord,
	describeError,
	isUuid,
	normaliseSavedActivityRow,
  type WriteTarget,
	type SavedPlace,
	type SavePayload,
	shouldFallback,
	toRecord,
} from '@dowhat/shared';
import { supabase } from '../lib/supabase';

interface SavedActivitiesContextValue {
  items: SavedPlace[];
  savedIds: Set<string>;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  pendingIds: Set<string>;
  isSaved: (placeId?: string | null) => boolean;
  save: (payload: SavePayload) => Promise<void>;
  unsave: (placeId: string) => Promise<void>;
  toggle: (payload: SavePayload) => Promise<void>;
  refresh: () => Promise<void>;
}

const SavedActivitiesContext = createContext<SavedActivitiesContextValue | undefined>(undefined);

export function SavedActivitiesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedPlace[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferredWriteTable, setPreferredWriteTable] = useState<string>('user_saved_activities');
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
          setUserId(data.user?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setUserId(null);
          setError(describeError(err));
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!authReady) return;
    if (!userId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    const promise = (async () => {
      setRefreshing(true);
      let lastError: string | null = null;
      for (const source of READ_SOURCES) {
        try {
          let query = supabase.from(source.table).select(source.select);
          if (source.userColumn) {
            query = query.eq(source.userColumn, userId);
          }
          const { data, error: queryError } = await query;
          if (queryError) {
            throw queryError;
          }
          const normalised = (data ?? [])
            .map((row) => normaliseSavedActivityRow(toRecord(row)))
            .filter((row): row is SavedPlace => Boolean(row));
          setItems(normalised);
          setPreferredWriteTable(source.writeTable);
          setError(null);
          return;
        } catch (err) {
          lastError = describeError(err);
          if (!shouldFallback(err)) {
            break;
          }
        }
      }
      setItems([]);
      setError(lastError ?? 'Failed to load saved activities');
    })()
      .catch((err) => {
        setError(describeError(err));
      })
      .finally(() => {
        refreshPromiseRef.current = null;
        setRefreshing(false);
        setLoading(false);
      });
    refreshPromiseRef.current = promise;
    return promise;
  }, [authReady, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  const ensureUserId = useCallback(() => {
    if (!userId) {
      throw new Error('Sign in to save places');
    }
    return userId;
  }, [userId]);

  const updatePending = useCallback((placeId: string, nextState: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (nextState) {
        next.add(placeId);
      } else {
        next.delete(placeId);
      }
      return next;
    });
  }, []);

  const addItem = useCallback((payload: SavePayload) => {
    setItems((prev) => {
      const filtered = prev.filter((item) => item.placeId !== payload.id);
      const venueId = payload.venueId && isUuid(payload.venueId) ? payload.venueId : isUuid(payload.id) ? payload.id : null;
      const next: SavedPlace = {
        placeId: payload.id,
        name: payload.name ?? null,
        address: payload.address ?? null,
        citySlug: payload.citySlug ?? null,
        venueId,
        sessionsCount: 0,
        updatedAt: new Date().toISOString(),
        metadata: payload.metadata ?? null,
      };
      return [next, ...filtered];
    });
  }, []);

  const removeItem = useCallback((placeId: string) => {
    setItems((prev) => prev.filter((item) => item.placeId !== placeId));
  }, []);

  const runWrite = useCallback(
    async (
      handler: (target: WriteTarget) => Promise<void>,
    ): Promise<void> => {
      const orderedTargets = [...WRITE_TARGETS].sort((a, b) => {
        if (a.table === preferredWriteTable) return -1;
        if (b.table === preferredWriteTable) return 1;
        return 0;
      });
      let lastError: unknown = null;
      for (const target of orderedTargets) {
        try {
          await handler(target);
          setPreferredWriteTable(target.table);
          return;
        } catch (err) {
          lastError = err;
          if (!shouldFallback(err)) {
            break;
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(describeError(lastError));
    },
    [preferredWriteTable],
  );

  const save = useCallback(
    async (payload: SavePayload) => {
      const resolvedUserId = ensureUserId();
      updatePending(payload.id, true);
      try {
        await runWrite(async (target) => {
          const insertPayload = target.buildInsert(resolvedUserId, payload);
          const cleanPayload = cleanRecord(insertPayload);
          const query = supabase.from(target.table).upsert(cleanPayload, target.onConflict ? { onConflict: target.onConflict } : undefined);
          const { error: upsertError } = await query;
          if (upsertError) {
            throw upsertError;
          }
        });
        addItem(payload);
        setError(null);
      } finally {
        updatePending(payload.id, false);
      }
    },
    [addItem, ensureUserId, runWrite, updatePending],
  );

  const unsave = useCallback(
    async (placeId: string) => {
      const resolvedUserId = ensureUserId();
      updatePending(placeId, true);
      try {
        await runWrite(async (target) => {
          const deletePayload = target.buildDelete(resolvedUserId, placeId);
          const { error: deleteError } = await supabase.from(target.table).delete().match(deletePayload);
          if (deleteError) {
            throw deleteError;
          }
        });
        removeItem(placeId);
      } finally {
        updatePending(placeId, false);
      }
    },
    [ensureUserId, removeItem, runWrite, updatePending],
  );

  const toggle = useCallback(
    async (payload: SavePayload) => {
      if (!payload?.id) return;
      if (pendingIds.has(payload.id)) return;
      if (items.some((item) => item.placeId === payload.id)) {
        await unsave(payload.id);
      } else {
        await save(payload);
      }
    },
    [items, pendingIds, save, unsave],
  );

  const savedIds = useMemo(() => new Set(items.map((item) => item.placeId)), [items]);

  const isSaved = useCallback((placeId?: string | null) => {
    if (!placeId) return false;
    return savedIds.has(placeId);
  }, [savedIds]);

  const pendingSet = useMemo(() => new Set(pendingIds), [pendingIds]);

  const value = useMemo((): SavedActivitiesContextValue => ({
    items,
    savedIds,
    loading,
    error,
    refreshing,
    pendingIds: pendingSet,
    isSaved,
    save,
    unsave,
    toggle,
    refresh,
  }), [items, savedIds, loading, error, refreshing, pendingSet, isSaved, save, unsave, toggle, refresh]);

  return <SavedActivitiesContext.Provider value={value}>{children}</SavedActivitiesContext.Provider>;
}

export const useSavedActivities = (): SavedActivitiesContextValue => {
  const context = useContext(SavedActivitiesContext);
  if (!context) {
    throw new Error('useSavedActivities must be used within a SavedActivitiesProvider');
  }
  return context;
};
