import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouterPush = jest.fn() as jest.Mock;
const mockGetUser = jest.fn() as jest.Mock;
const mockFrom = jest.fn() as jest.Mock;

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
  }),
}));

jest.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

type QueryBuilder = {
  select: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  upsert: jest.Mock;
};

const createQueryBuilder = (): QueryBuilder => {
  const builder = {} as QueryBuilder;
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({ data: { core_values: [] }, error: null })) as jest.Mock;
  builder.upsert = jest.fn(async () => ({ error: null })) as jest.Mock;
  return builder;
};

let CoreValuesForm: typeof import('../CoreValuesForm').CoreValuesForm;

describe('CoreValuesForm', () => {
  let profileQuery: QueryBuilder;
  let userPreferenceQuery: QueryBuilder;

  beforeAll(async () => {
    ({ CoreValuesForm } = await import('../CoreValuesForm'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    profileQuery = createQueryBuilder();
    userPreferenceQuery = createQueryBuilder();
    mockFrom.mockImplementation(((...args: unknown[]) => {
      const table = typeof args[0] === 'string' ? args[0] : '';
      if (table === 'profiles') return profileQuery;
      if (table === 'user_preferences') return userPreferenceQuery;
      return createQueryBuilder();
    }) as (...args: unknown[]) => unknown);
    mockGetUser.mockImplementation(async () => ({ data: { user: { id: 'user-123' } } }));
  });

  it('retries save without user_id when profiles.user_id column is missing', async () => {
    const user = userEvent.setup();
    const upsertMock = profileQuery.upsert as unknown as jest.Mock<any>;
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'column "user_id" of relation "profiles" does not exist' } }));
    upsertMock.mockImplementationOnce(async () => ({ error: null }));

    render(<CoreValuesForm redirectTo="/onboarding/reliability-pledge" />);

    await screen.findByRole('heading', { name: /add your 3 core values/i });

    await user.type(screen.getByLabelText(/core value 1/i), 'Community');
    await user.type(screen.getByLabelText(/core value 2/i), 'Cats');
    await user.type(screen.getByLabelText(/core value 3/i), 'Loyalty');
    await user.click(screen.getByRole('button', { name: /save values and continue/i }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/onboarding/reliability-pledge'));

    expect(profileQuery.upsert).toHaveBeenCalledTimes(2);
    expect(profileQuery.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'user-123', user_id: 'user-123' }),
      { onConflict: 'id' },
    );
    expect(profileQuery.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'user-123' }),
      { onConflict: 'id' },
    );
    const secondPayload = profileQuery.upsert.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(secondPayload).not.toHaveProperty('user_id');
  });

  it('falls back to user_preferences when profiles.core_values column is missing', async () => {
    const user = userEvent.setup();
    const upsertMock = profileQuery.upsert as unknown as jest.Mock<any>;
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'column "core_values" of relation "profiles" does not exist' } }));

    render(<CoreValuesForm redirectTo="/onboarding/reliability-pledge" />);

    await screen.findByRole('heading', { name: /add your 3 core values/i });

    await user.type(screen.getByLabelText(/core value 1/i), 'Community');
    await user.type(screen.getByLabelText(/core value 2/i), 'Cats');
    await user.type(screen.getByLabelText(/core value 3/i), 'Loyalty');
    await user.click(screen.getByRole('button', { name: /save values and continue/i }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/onboarding/reliability-pledge'));

    expect(userPreferenceQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        key: 'onboarding_core_values',
        value: ['Community', 'Cats', 'Loyalty'],
      }),
      { onConflict: 'user_id,key' },
    );
  });
});
