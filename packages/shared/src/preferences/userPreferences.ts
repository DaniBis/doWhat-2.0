export type PreferenceKey =
  | 'activity_filters'
  | 'people_filters'
  | 'map_filters'
  | 'onboarding_core_values';

const TABLE = 'user_preferences';

export type RawPreferenceRow = {
  user_id: string;
  key: PreferenceKey;
  value: unknown;
  updated_at: string;
};

type QueryBuilderResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type MutationResult = Promise<{ error: { message: string } | null }>;

type PreferencesQueryBuilder = {
  select: (columns: string) => PreferencesQueryBuilder;
  eq: (column: string, value: unknown) => PreferencesQueryBuilder;
  maybeSingle: <T>() => QueryBuilderResult<T>;
  upsert: (value: unknown, options: { onConflict: string }) => MutationResult;
};

export type MinimalSupabaseClient = {
  from: (table: string) => unknown;
};

export const loadUserPreference = async <T>(
  client: MinimalSupabaseClient,
  userId: string,
  key: PreferenceKey,
): Promise<T | null> => {
  const { data: loadedData, error: loadError } = await (client
    .from(TABLE) as PreferencesQueryBuilder)
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle<{ value: T | null }>();

  if (loadError) {
    throw loadError;
  }

  return (loadedData?.value ?? null) as T | null;
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

  const { error } = await (client
    .from(TABLE) as PreferencesQueryBuilder)
    .upsert(payload, { onConflict: 'user_id,key' });

  if (error) {
    throw error;
  }
};
