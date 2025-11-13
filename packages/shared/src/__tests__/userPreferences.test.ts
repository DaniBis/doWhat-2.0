import { loadUserPreference, saveUserPreference, type MinimalSupabaseClient } from '../preferences/userPreferences';

describe('userPreferences helpers', () => {
  const table = 'user_preferences';

  const createSelectClient = (maybeSingleImpl: jest.Mock) => {
    const queryBuilder: any = {
      eq: jest.fn(),
      maybeSingle: maybeSingleImpl,
    };
    queryBuilder.eq.mockImplementation(() => queryBuilder);

    const select = jest.fn(() => queryBuilder);
    const from = jest.fn(() => ({ select }));

    const client = { from } as unknown as MinimalSupabaseClient;
    return { client, from, select, eq: queryBuilder.eq, maybeSingle: maybeSingleImpl };
  };

  it('loads a stored preference value', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: { value: { example: true } }, error: null });
    const { client, from, select, eq } = createSelectClient(maybeSingle);

    const result = await loadUserPreference<{ example: boolean }>(client, 'user-123', 'activity_filters');

    expect(from).toHaveBeenCalledWith(table);
    expect(select).toHaveBeenCalledWith('value');
    expect(eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-123');
    expect(eq).toHaveBeenNthCalledWith(2, 'key', 'activity_filters');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ example: true });
  });

  it('returns null when no preference is found', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const { client } = createSelectClient(maybeSingle);

    const result = await loadUserPreference(client, 'user-123', 'people_filters');

    expect(result).toBeNull();
  });

  it('persists preference values via upsert', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({ upsert }));
    const client = { from } as unknown as MinimalSupabaseClient;

    const payload = { theme: 'dark' };
    await saveUserPreference(client, 'user-456', 'map_filters', payload);

    expect(from).toHaveBeenCalledWith(table);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [arg, options] = upsert.mock.calls[0];
    expect(arg.user_id).toBe('user-456');
    expect(arg.key).toBe('map_filters');
    expect(arg.value).toEqual(payload);
    expect(typeof arg.updated_at).toBe('string');
    expect(options).toEqual({ onConflict: 'user_id,key' });
  });
});
