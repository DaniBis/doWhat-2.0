/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { supabase } from '../lib/supabase';

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
jest.mock('expo-router', () => ({ Link: ({ children }: any) => children }));
// NOTE: Avoid patching 'react-native' at module level to prevent resolver issues
// in Jest when the suite is skipped. If/when re-enabling this suite, consider
// moving any RN shims into the test body or setup file.

// Import the component after mocks are in place
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Profile = require('../app/profile/index').default as any;

// Mock fetch for badges endpoints used in profile load
// Stable mock for fetch avoiding strict generic typing
const mockFetch: jest.Mock = jest.fn();
// @ts-expect-error jest v30 Mock typing is too strict here
mockFetch.mockResolvedValue({ ok: true, json: async () => ({ badges: [] }) });
global.fetch = mockFetch as any;
// Loosen types for mocked Supabase client to avoid ts-jest generic friction
const supabaseAny = supabase as any;

// Helper to create a chainable query builder mock for supabase.from('profiles')
function createProfilesSelectMock(result?: any, error?: any) {
  const maybeSingle: jest.Mock = jest.fn();
  // @ts-expect-error jest v30 Mock typing is too strict here
  maybeSingle.mockResolvedValue({ data: result, error });
  const upsert: jest.Mock = jest.fn();
  // @ts-expect-error jest v30 Mock typing is too strict here
  upsert.mockResolvedValue({ error: null });
  const updateEq: jest.Mock = jest.fn();
  // @ts-expect-error jest v30 Mock typing is too strict here
  updateEq.mockResolvedValue({ error: null });
  const update: jest.Mock = jest.fn().mockReturnValue({ eq: updateEq });
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle,
    upsert,
    update,
  } as any;
}

describe('Mobile Profile edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    supabaseAny.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'u@example.com' } } });
    supabaseAny.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    supabaseAny.auth.updateUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    supabaseAny.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
      }
      const maybe: jest.Mock = jest.fn();
      // @ts-expect-error jest v30 Mock typing is too strict here
      maybe.mockResolvedValue({ data: null, error: null });
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: maybe };
    });
  });

  it('loads current profile values into inputs', async () => {
    const { findByText, findByDisplayValue } = render(<Profile />);
    await findByText('Old Name');
    fireEvent.press(await findByText('Edit Profile'));
    expect(await findByDisplayValue('Old Name')).toBeTruthy();
  });

  it('saves edited name and avatar', async () => {
    const profileBuilder = createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
    supabaseAny.from.mockImplementation((table: string) => profileBuilder);

    const { getByText, findByText, findByDisplayValue } = render(<Profile />);
    fireEvent.press(await findByText('Edit Profile'));

    const nameInput = await findByDisplayValue('Old Name');
    fireEvent.changeText(nameInput, 'New Name');

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(profileBuilder.upsert).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'New Name' }), { onConflict: 'id' });
    });
  });

  it('shows error message on save failure', async () => {
    const failingBuilder = createProfilesSelectMock({ full_name: 'Old Name', avatar_url: 'https://img/old.png' });
    failingBuilder.upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    supabaseAny.from.mockImplementation((table: string) => failingBuilder);

    const { getByText, findByDisplayValue, findByText, findAllByText } = render(<Profile />);
    fireEvent.press(await findByText('Edit Profile'));

    await findByDisplayValue('Old Name');

    fireEvent.press(getByText('Save'));
    const errors = await findAllByText('boom');
    expect(errors.length).toBeGreaterThan(0);
  });
});
/* eslint-disable @typescript-eslint/no-var-requires */
