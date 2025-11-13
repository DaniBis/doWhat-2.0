/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type SupabaseAuthMock = {
  getUser: jest.MockedFunction<() => Promise<{ data: { user: { id: string; email?: string } } | null }>>;
  onAuthStateChange: jest.MockedFunction<() => { data: { subscription: { unsubscribe: () => void } } }>;
  updateUser: jest.MockedFunction<(value: unknown) => Promise<{ data: { user: { id: string } } | null; error: unknown }>>;
};

type UpdateEqMock = jest.MockedFunction<(value: unknown) => Promise<{ error: unknown }>>;
type UpdateResponse = { eq: UpdateEqMock };

type ProfilesQueryBuilder = {
  select: jest.MockedFunction<() => ProfilesQueryBuilder>;
  eq: jest.MockedFunction<(column: string, value: unknown) => ProfilesQueryBuilder>;
  maybeSingle: jest.MockedFunction<() => Promise<{ data: unknown; error: unknown }>>;
  upsert: jest.MockedFunction<(value: unknown, options?: { onConflict?: string }) => Promise<{ error: unknown }>>;
  update: jest.MockedFunction<(value: unknown) => UpdateResponse>;
};

type SupabaseClientMock = {
  auth: SupabaseAuthMock;
  from: jest.MockedFunction<(table: string) => ProfilesQueryBuilder>;
};

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      onAuthStateChange: jest.fn(),
      updateUser: jest.fn(),
    },
    from: jest.fn(),
  }
}));

// Stub expo-linear-gradient for JSDOM tests
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
// Stub expo-router Link to a passthrough
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// NOTE: Avoid patching 'react-native' at module level to prevent resolver issues
// in Jest when the suite is skipped. If/when re-enabling this suite, consider
// moving any RN shims into the test body or setup file.

// Import the component after mocks are in place
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Profile = require('../app/profile/index').default as React.ComponentType<Record<string, unknown>>;

// Mock fetch for badges endpoints used in profile load
// Stable mock for fetch avoiding strict generic typing
const mockFetch: jest.Mock = jest.fn();
// @ts-expect-error jest v30 Mock typing is too strict here
mockFetch.mockResolvedValue({ ok: true, json: async () => ({ badges: [] }) });
global.fetch = mockFetch as unknown as typeof global.fetch;
// Loosen types for mocked Supabase client to avoid ts-jest generic friction
const supabaseMock = supabase as unknown as SupabaseClientMock;

const SafeAreaTestProvider = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 375, height: 812 },
      insets: { top: 44, left: 0, right: 0, bottom: 34 },
    }}
  >
    {children}
  </SafeAreaProvider>
);

const FIND_WAIT = { timeout: 8000 } as const;

jest.setTimeout(20000);

// Helper to create a chainable query builder mock for supabase.from('profiles')
function createProfilesSelectMock(result?: unknown, error?: unknown): ProfilesQueryBuilder {
  const maybeSingle = jest.fn(async () => ({ data: result, error })) as ProfilesQueryBuilder['maybeSingle'];
  const upsert = jest.fn(async () => ({ error: null as unknown })) as ProfilesQueryBuilder['upsert'];
  const updateEq = jest.fn(async () => ({ error: null as unknown })) as UpdateEqMock;
  const update = jest.fn(() => ({ eq: updateEq })) as ProfilesQueryBuilder['update'];
  const builder: ProfilesQueryBuilder = {
    select: jest.fn() as ProfilesQueryBuilder['select'],
    eq: jest.fn() as ProfilesQueryBuilder['eq'],
    maybeSingle,
    upsert,
    update,
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe('Mobile Profile edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'u@example.com' } } });
    supabaseMock.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    supabaseMock.auth.updateUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
      }
      return createProfilesSelectMock();
    });
  });

  it('loads current profile values into inputs', async () => {
    const { findByText, findByDisplayValue } = render(<Profile />, { wrapper: SafeAreaTestProvider });
    fireEvent.press(await findByText('Edit Profile', undefined, FIND_WAIT));
    expect(await findByDisplayValue('Old Name', undefined, FIND_WAIT)).toBeTruthy();
  });

  it('saves edited name and avatar', async () => {
    const profileBuilder = createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
    supabaseMock.from.mockImplementation((_table: string) => profileBuilder);

    const { getByText, findByText, findByDisplayValue } = render(<Profile />, { wrapper: SafeAreaTestProvider });
    fireEvent.press(await findByText('Edit Profile', undefined, FIND_WAIT));

    const nameInput = await findByDisplayValue('Old Name', undefined, FIND_WAIT);
    fireEvent.changeText(nameInput, 'New Name');

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(profileBuilder.upsert).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'New Name' }), { onConflict: 'id' });
    });
  });

  it('shows error message on save failure', async () => {
    const failingBuilder = createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
    failingBuilder.upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    supabaseMock.from.mockImplementation((_table: string) => failingBuilder);

    const { getByText, findByDisplayValue, findByText, findAllByText } = render(<Profile />, { wrapper: SafeAreaTestProvider });
    fireEvent.press(await findByText('Edit Profile', undefined, FIND_WAIT));

    await findByDisplayValue('Old Name', undefined, FIND_WAIT);

    fireEvent.press(getByText('Save'));
    const errors = await findAllByText('boom', undefined, FIND_WAIT);
    expect(errors.length).toBeGreaterThan(0);
  });
});
/* eslint-disable @typescript-eslint/no-var-requires */
