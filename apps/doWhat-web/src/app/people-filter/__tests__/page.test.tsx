import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PeopleFilterPage from '../page';
import { supabase } from '@/lib/supabase/browser';
import { loadUserPreference, saveUserPreference, trackOnboardingEntry } from '@dowhat/shared';

jest.mock('next/link', () => {
  return ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  );
});

jest.mock('@/lib/supabase/browser', () => {
  const auth = { getUser: jest.fn() };
  return {
    supabase: {
      auth,
      from: jest.fn(),
    },
  };
});

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared');
  return {
    ...actual,
    loadUserPreference: jest.fn(),
    saveUserPreference: jest.fn(),
    trackOnboardingEntry: jest.fn(),
  };
});

jest.mock('@/components/TaxonomyCategoryPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="taxonomy-picker" />,
}));

const mockSupabase = supabase as unknown as {
  auth: { getUser: jest.Mock };
  from: jest.Mock;
};

const mockLoadPreference = loadUserPreference as jest.MockedFunction<typeof loadUserPreference>;
const mockSavePreference = saveUserPreference as jest.MockedFunction<typeof saveUserPreference>;
const mockTrackOnboardingEntry = trackOnboardingEntry as jest.MockedFunction<typeof trackOnboardingEntry>;

const supabaseState = {
  traitCount: 0,
  pledgeAckAt: '2024-01-01T00:00:00.000Z' as string | null,
  pledgeVersion: 'v1' as string | null,
};

const resetSupabaseState = () => {
  supabaseState.traitCount = 0;
  supabaseState.pledgeAckAt = '2024-01-01T00:00:00.000Z';
  supabaseState.pledgeVersion = 'v1';
};

const setTraitCount = (count: number) => {
  supabaseState.traitCount = count;
};

const setPledgeState = ({ ackAt, version }: { ackAt: string | null; version?: string | null }) => {
  supabaseState.pledgeAckAt = ackAt;
  supabaseState.pledgeVersion = version ?? null;
};

const createTraitCountBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => Promise.resolve({ count: supabaseState.traitCount, error: null }));
  return builder;
};

const createProfileBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(() =>
    Promise.resolve({
      data: {
        reliability_pledge_ack_at: supabaseState.pledgeAckAt,
        reliability_pledge_version: supabaseState.pledgeVersion,
      },
      error: null,
    }),
  );
  return builder;
};

const installSupabaseTables = () => {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'user_base_traits') {
      return createTraitCountBuilder();
    }
    if (table === 'profiles') {
      return createProfileBuilder();
    }
    throw new Error(`Unexpected table ${table}`);
  });
};

const respondWith = (data: unknown, ok = true) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  } as Response);

const mountPeopleFilterPage = async () => {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/traits/popular')) {
      return respondWith([]);
    }
    return respondWith({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-999' } } });
  mockLoadPreference.mockResolvedValue(null);
  mockSavePreference.mockResolvedValue();

  render(<PeopleFilterPage />);

  await waitFor(() => expect(mockSupabase.auth.getUser).toHaveBeenCalled());
};

describe('PeopleFilterPage trait onboarding banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSupabaseState();
    installSupabaseTables();
    window.localStorage.clear();
  });

  it('shows the trait onboarding banner when the user has fewer than five base traits', async () => {
    setTraitCount(3);
    await mountPeopleFilterPage();

    await waitFor(() => expect(screen.getByText('Finish your base traits')).toBeInTheDocument());
    expect(screen.getByText('Pick 2 more traits to unlock personalized people filters and better trait hints.')).toBeInTheDocument();
  });

  it('hides the trait onboarding banner when the user already has five base traits', async () => {
    setTraitCount(5);
    await mountPeopleFilterPage();

    await waitFor(() => {
      expect(screen.queryByText('Finish your base traits')).toBeNull();
    });
  });

  it('tracks analytics when the trait CTA is clicked', async () => {
    setTraitCount(3);
    await mountPeopleFilterPage();

    const user = userEvent.setup();
    const cta = await screen.findByRole('link', { name: /go to onboarding/i });
    await user.click(cta);

    expect(mockTrackOnboardingEntry).toHaveBeenCalledWith({
      source: 'people-filter-banner',
      platform: 'web',
      step: 'traits',
    });
  });
});

describe('PeopleFilterPage reliability pledge banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSupabaseState();
    installSupabaseTables();
    window.localStorage.clear();
  });

  it('shows the pledge banner when the acknowledgement is missing', async () => {
    setTraitCount(5);
    setPledgeState({ ackAt: null, version: null });
    await mountPeopleFilterPage();

    await waitFor(() =>
      expect(screen.getByText('Confirm the reliability pledge')).toBeInTheDocument(),
    );
  });

  it('hides the pledge banner when the acknowledgement exists', async () => {
    setTraitCount(5);
    setPledgeState({ ackAt: '2025-01-01T00:00:00.000Z', version: 'v2' });
    await mountPeopleFilterPage();

    await waitFor(() => {
      expect(screen.queryByText('Confirm the reliability pledge')).toBeNull();
    });
  });

  it('tracks onboarding analytics when the pledge CTA is clicked', async () => {
    setTraitCount(5);
    setPledgeState({ ackAt: null, version: null });
    await mountPeopleFilterPage();

    const user = userEvent.setup();
    const cta = await screen.findByRole('link', { name: /review pledge/i });
    await user.click(cta);

    expect(mockTrackOnboardingEntry).toHaveBeenCalledWith({
      source: 'people-filter-banner',
      platform: 'web',
      step: 'pledge',
    });
  });
});
