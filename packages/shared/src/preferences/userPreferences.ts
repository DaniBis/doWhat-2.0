import type { SupabaseClient } from '@supabase/supabase-js';

export type PreferenceKey =
  | 'activity_filters'
  | 'people_filters'
  | 'map_filters';

const TABLE = 'user_preferences';

export type RawPreferenceRow = {
  user_id: string;
  key: PreferenceKey;
  value: unknown;
  updated_at: string;
};

export type MinimalSupabaseClient = SupabaseClient;

export const loadUserPreference = async <T>(
  client: MinimalSupabaseClient,
  userId: string,
  key: PreferenceKey,
): Promise<T | null> => {
  const { data, error } = await client
    .from(TABLE)
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle<{ value: T | null }>();
  if (error) {
    throw error;
  }
  return (data?.value ?? null) as T | null;
};

export const saveUserPreference = async <T>(
  client: MinimalSupabaseClient,
  userId: string,
  key: PreferenceKey,
  value: T,
): Promise<void> => {
  const payload = {
    user_id: userId,
    key,
    value,
    updated_at: new Date().toISOString(),
  } satisfies Omit<RawPreferenceRow, 'value'> & { value: T };

  const { error } = await client
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id,key' });

  if (error) {
    throw error;
  }
};
