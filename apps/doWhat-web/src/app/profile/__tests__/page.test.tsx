import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProfilePage from '../page';
import { supabase } from '@/lib/supabase/browser';

function createMockComponent(testId: string, name: string) {
  const Component = () => <div data-testid={testId} />;
  Component.displayName = name;
  return Component;
}

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared');
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
  };
});

jest.mock('next/link', () => {
  const MockLink = ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string | { pathname?: string };
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={typeof href === 'string' ? href : href?.pathname ?? '#'}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
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

jest.mock('@/components/profile/ProfileHeader', () => ({
  ProfileHeader: createMockComponent('profile-header', 'ProfileHeader'),
}));

jest.mock('@/components/profile/SportOnboardingBanner', () => ({
  SportOnboardingBanner: createMockComponent('sport-banner', 'SportOnboardingBanner'),
}));

jest.mock('@/components/profile/ReliabilityPledgeBanner', () => ({
  ReliabilityPledgeBanner: createMockComponent('reliability-banner', 'ReliabilityPledgeBanner'),
}));

jest.mock('@/components/profile/OnboardingProgressBanner', () => {
  const OnboardingProgressBanner = ({ steps }: { steps: string[] }) => (
    <div data-testid="onboarding-progress-banner">{steps.join(',')}</div>
  );
  OnboardingProgressBanner.displayName = 'OnboardingProgressBanner';
  return { OnboardingProgressBanner };
});

jest.mock('@/components/profile/KPIGrid', () => ({
  KPIGrid: createMockComponent('kpi-grid', 'KPIGrid'),
}));

jest.mock('@/components/profile/BadgesPreview', () => ({
  BadgesPreview: createMockComponent('badges-preview', 'BadgesPreview'),
}));

jest.mock('@/components/profile/AttendanceBars', () => ({
  AttendanceBars: createMockComponent('attendance-bars', 'AttendanceBars'),
}));

jest.mock('@/components/profile/BioCard', () => ({
  BioCard: createMockComponent('bio-card', 'BioCard'),
}));

jest.mock('@/components/profile/ReviewsTab', () => ({
  ReviewsTab: createMockComponent('reviews-tab', 'ReviewsTab'),
}));

jest.mock('@/components/traits/TraitCarousel', () => ({
  TraitCarousel: createMockComponent('trait-carousel', 'TraitCarousel'),
}));

jest.mock('@/components/traits/TraitSelector', () => ({
  TraitSelector: createMockComponent('trait-selector', 'TraitSelector'),
}));

const { trackOnboardingEntry } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
};

const mockSupabase = supabase as unknown as {
  auth: { getUser: jest.Mock };
  from: jest.Mock;
};

const mockAuthGetUser = () =>
  mockSupabase.auth.getUser as jest.MockedFunction<typeof mockSupabase.auth.getUser>;

type ProfileRowData = { primary_sport: string | null; play_style: string | null; reliability_pledge_ack_at: string | null };
let profileRowData: ProfileRowData = { primary_sport: null, play_style: null, reliability_pledge_ack_at: null };

let sportProfileSkill: string | null = null;

const setupSupabaseProfileQueries = (overrides: Partial<ProfileRowData> = {}) => {
  profileRowData = {
    primary_sport: overrides.primary_sport ?? null,
    play_style: overrides.play_style ?? null,
    reliability_pledge_ack_at: overrides.reliability_pledge_ack_at ?? null,
  };
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      const builder: Record<string, unknown> = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.maybeSingle = jest.fn(async () => ({ data: profileRowData, error: null }));
      return builder;
    }
    if (table === 'user_sport_profiles') {
      const builder: Record<string, unknown> = {};
      builder.select = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      builder.maybeSingle = jest.fn(async () => ({ data: { skill_level: sportProfileSkill }, error: null }));
      return builder;
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

const buildTrait = (id: string, baseCount: number) => ({
  id,
  name: `Trait ${id}`,
  icon: 'Sparkles',
  baseCount,
  voteCount: 0,
  score: 10,
  updatedAt: '2025-01-01T00:00:00.000Z',
  color: '#0EA5E9',
});

type MountOptions = {
  primarySport?: string | null;
  playStyle?: string | null;
  sportSkillLevel?: string | null;
  pledgeAck?: string | null;
};

const mountProfilePage = async (traits: Array<ReturnType<typeof buildTrait>>, options: MountOptions = {}) => {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/profile/user-123') {
      return respondWith({ name: 'Test User', location: 'Bucharest' });
    }
    if (url === '/api/profile/user-123/kpis') {
      return respondWith([]);
    }
    if (url === '/api/profile/user-123/reliability') {
      return respondWith({ reliability: null, attendance: undefined });
    }
    if (url === '/api/profile/user-123/traits?top=6') {
      return respondWith(traits);
    }
    if (url === '/api/profile/user-123/badges?limit=4') {
      return respondWith([]);
    }
    return respondWith({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  mockAuthGetUser().mockResolvedValue({ data: { user: { id: 'user-123' } } });
  setupSupabaseProfileQueries({
    primary_sport: options.primarySport ?? null,
    play_style: options.playStyle ?? null,
    reliability_pledge_ack_at: options.pledgeAck ?? null,
  });
  sportProfileSkill = options.sportSkillLevel ?? null;

  render(<ProfilePage />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/profile/user-123')); // ensure data load finished
};

describe('ProfilePage trait onboarding banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the trait onboarding banner when the base stack is incomplete', async () => {
    await mountProfilePage([
      buildTrait('t1', 1),
      buildTrait('t2', 1),
      buildTrait('t3', 1),
    ]);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Traits' }));
    await waitFor(() => expect(screen.getByText('Finish your base traits')).toBeInTheDocument());
    expect(screen.getByText('Pick 2 more traits to lock in the full onboarding stack and unlock better people filters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to onboarding/i })).toHaveAttribute('href', '/onboarding/traits');
  });

  it('hides the trait onboarding banner once five base traits exist', async () => {
    await mountProfilePage([
      buildTrait('t1', 1),
      buildTrait('t2', 1),
      buildTrait('t3', 1),
      buildTrait('t4', 1),
      buildTrait('t5', 1),
    ]);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Traits' }));
    await waitFor(() => {
      expect(screen.queryByText('Finish your base traits')).toBeNull();
    });
  });

  it('tracks analytics when the trait CTA is clicked', async () => {
    await mountProfilePage([
      buildTrait('t1', 1),
      buildTrait('t2', 1),
      buildTrait('t3', 1),
    ]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Traits' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Go to onboarding/i })).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: /Go to onboarding/i }));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'traits-banner',
      platform: 'web',
      step: 'traits',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding/traits',
    });
  });
});

describe('ProfilePage onboarding progress banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists every incomplete onboarding step', async () => {
    await mountProfilePage([
      buildTrait('t1', 1),
      buildTrait('t2', 1),
      buildTrait('t3', 1),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-progress-banner')).toHaveTextContent('traits,sport,pledge');
    });
  });

  it('hides the progress banner once all steps are complete', async () => {
    await mountProfilePage(
      [
        buildTrait('t1', 1),
        buildTrait('t2', 1),
        buildTrait('t3', 1),
        buildTrait('t4', 1),
        buildTrait('t5', 1),
      ],
      {
        primarySport: 'padel',
        playStyle: 'competitive',
        sportSkillLevel: '3.0 - Consistent drives',
        pledgeAck: '2025-12-01T00:00:00.000Z',
      }
    );

    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-progress-banner')).toBeNull();
    });
  });
});
