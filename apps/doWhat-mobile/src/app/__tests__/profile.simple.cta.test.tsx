import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Pressable } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { WebBrowserResult } from 'expo-web-browser';

type ExpoWebBrowserModule = typeof import('expo-web-browser');

const dismissedBrowserResult: WebBrowserResult = { type: 'dismiss' as WebBrowserResult['type'] };

jest.mock('expo-web-browser', () => {
  const openBrowserAsync = jest.fn();
  const WebBrowserResultType = {
    DISMISS: dismissedBrowserResult.type,
    CANCEL: 'cancel' as WebBrowserResult['type'],
  };
  return {
    __esModule: true,
    default: {
      openBrowserAsync,
      WebBrowserResultType,
    },
    openBrowserAsync,
    WebBrowserResultType,
  };
});

const { openBrowserAsync: mockOpenBrowserAsync } = jest.requireMock('expo-web-browser') as {
  openBrowserAsync: jest.MockedFunction<ExpoWebBrowserModule['openBrowserAsync']>;
};
mockOpenBrowserAsync.mockResolvedValue(dismissedBrowserResult);

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

jest.mock('../../lib/web', () => ({
  createWebUrl: (path: string) => new URL(`https://example.org${path}`),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('@dowhat/shared', () => {
  const actual = jest.requireActual('@dowhat/shared') as typeof import('@dowhat/shared');
  return {
    ...actual,
    trackOnboardingEntry: jest.fn(),
    trackReliabilityAttendanceLogViewed: jest.fn(),
  };
});

const profileState = {
  baseTraitCount: 0,
  profileRow: {
    id: 'user-mobile',
    full_name: 'Test User',
    avatar_url: null,
    instagram: null,
    whatsapp: null,
    bio: null,
    location: null,
    personality_traits: [],
    primary_sport: null as string | null,
    play_style: null as string | null,
    reliability_pledge_ack_at: null as string | null,
    reliability_pledge_version: null as string | null,
  },
};

const sportProfileState = {
  skill_level: null as string | null,
};

const createUserBaseTraitsBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(async () => ({ data: [], error: null, count: profileState.baseTraitCount }));
  return builder;
};

const createProfilesBuilder = () => {
  const builder: any = { mode: 'read' };
  builder.select = jest.fn(() => {
    builder.mode = 'read';
    return builder;
  });
  builder.update = jest.fn(() => {
    builder.mode = 'write';
    return builder;
  });
  builder.upsert = jest.fn(async () => ({ data: null, error: null }));
  builder.eq = jest.fn(() => {
    if (builder.mode === 'write') {
      return Promise.resolve({ data: null, error: null });
    }
    return builder;
  });
  builder.maybeSingle = jest.fn(async () => ({ data: profileState.profileRow, error: null }));
  builder.single = jest.fn(async () => ({ data: profileState.profileRow, error: null }));
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.range = jest.fn(() => builder);
  builder.insert = jest.fn(() => {
    builder.mode = 'write';
    return builder;
  });
  return builder;
};

const createUserSportProfilesBuilder = () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({ data: sportProfileState.skill_level ? { skill_level: sportProfileState.skill_level } : null, error: null }));
  return builder;
};

jest.mock('../../lib/supabase', () => {
  const auth = {
    getUser: jest.fn(async () => ({ data: { user: { id: 'user-mobile', user_metadata: {} } } })),
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: { unsubscribe: jest.fn() },
      },
    })),
    signOut: jest.fn(async () => ({ error: null })),
    updateUser: jest.fn(async () => ({ error: null })),
  };

  const supabaseMock = {
    auth,
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: { path: 'avatar.png' }, error: null })),
        remove: jest.fn(async () => ({ data: null, error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.org/avatar.png' } })),
      })),
    },
    from: jest.fn((table: string) => {
      if (table === 'user_base_traits') {
        return createUserBaseTraitsBuilder();
      }
      if (table === 'profiles') {
        return createProfilesBuilder();
      }
      if (table === 'user_sport_profiles') {
        return createUserSportProfilesBuilder();
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase: supabaseMock,
    __supabaseMock: {
      setBaseTraitCount: (count: number) => {
        profileState.baseTraitCount = count;
      },
      setSportProfile: ({ primarySport, playStyle, skillLevel }: { primarySport?: string | null; playStyle?: string | null; skillLevel?: string | null }) => {
        profileState.profileRow.primary_sport = primarySport ?? null;
        profileState.profileRow.play_style = playStyle ?? null;
        sportProfileState.skill_level = skillLevel ?? null;
      },
      supabase: supabaseMock,
    },
  };
});

const { __supabaseMock } = jest.requireMock('../../lib/supabase') as {
  __supabaseMock: {
    setBaseTraitCount: (count: number) => void;
    setSportProfile: (options: { primarySport?: string | null; playStyle?: string | null; skillLevel?: string | null }) => void;
    supabase: { auth: { getUser: jest.Mock } };
  };
};

const { trackOnboardingEntry, trackReliabilityAttendanceLogViewed } = jest.requireMock('@dowhat/shared') as {
  trackOnboardingEntry: jest.Mock;
  trackReliabilityAttendanceLogViewed: jest.Mock;
};

const resetTestState = () => {
  jest.clearAllMocks();
  installFetchMock();
  trackOnboardingEntry.mockClear();
  trackReliabilityAttendanceLogViewed.mockClear();
  mockOpenBrowserAsync.mockClear();
  mockOpenBrowserAsync.mockResolvedValue(dismissedBrowserResult);
  alertSpy.mockClear();
  setReliabilityResponseHandler(null);
  profileState.profileRow.reliability_pledge_ack_at = null;
  profileState.profileRow.reliability_pledge_version = null;
  profileState.profileRow.primary_sport = null;
  profileState.profileRow.play_style = null;
  sportProfileState.skill_level = null;
  __supabaseMock.setBaseTraitCount(0);
};

const mockFetchResponse = (body: unknown): Response => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

const mockFetchErrorResponse = (status: number, body?: unknown): Response => ({
  ok: false,
  status,
  json: async () => body ?? {},
}) as Response;

const defaultReliabilityPayload = { reliability: null, attendance: null };

type ReliabilityResponseHandler = () => Promise<Response>;
let reliabilityResponseHandler: ReliabilityResponseHandler | null = null;

const setReliabilityResponseHandler = (handler: ReliabilityResponseHandler | null) => {
  reliabilityResponseHandler = handler;
};

const configureReliabilitySuccess = (payload: unknown) => {
  setReliabilityResponseHandler(async () => mockFetchResponse(payload));
};

const configureReliabilityFailure = (status: number, body?: unknown) => {
  setReliabilityResponseHandler(async () => mockFetchErrorResponse(status, body));
};

const createDeferredReliabilityFetch = () => {
  let resolveFn: ((value: Response) => void) | null = null;
  let rejectFn: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<Response>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  setReliabilityResponseHandler(() => promise);
  return {
    resolve: (payload: unknown) => {
      resolveFn?.(mockFetchResponse(payload));
    },
    reject: (error: Error) => {
      rejectFn?.(error);
    },
  };
};

const defaultFetchHandler = async (input: string | URL) => {
  const target = typeof input === 'string' ? input : input.toString();
  if (target.includes('/api/users/') && target.includes('/badges')) {
    return mockFetchResponse({ badges: [] });
  }
  if (target.includes('/api/badges/catalog')) {
    return mockFetchResponse({ badges: [] });
  }
  if (target.includes('/api/profile/') && target.includes('/traits')) {
    return mockFetchResponse([]);
  }
  if (target.includes('/api/profile/') && target.includes('/reliability')) {
    if (reliabilityResponseHandler) {
      return reliabilityResponseHandler();
    }
    return mockFetchResponse(defaultReliabilityPayload);
  }
  return mockFetchResponse({});
};

const installFetchMock = () => {
  global.fetch = jest.fn(defaultFetchHandler) as unknown as typeof fetch;
};

import ProfileScreen from '../profile.simple';

describe('Mobile Profile sport onboarding CTA', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('renders the sport CTA when sport data is incomplete', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getAllByText('Set your sport & skill').length).toBeGreaterThan(0));
    expect(screen.getByText('Go to sport onboarding')).toBeTruthy();
  });

  it('hides the sport CTA once sport, play style, and skill are saved', async () => {
    __supabaseMock.setSportProfile({ primarySport: 'padel', playStyle: 'competitive', skillLevel: '3.5 - Consistent rallies' });

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.queryByText('Set your sport & skill')).toBeNull();
    });
  });

  it('tracks analytics when the sport CTA is pressed', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Go to sport onboarding')).toBeTruthy());
    fireEvent.press(screen.getByText('Go to sport onboarding'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'sport-banner',
      platform: 'mobile',
      step: 'sport',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding/sports',
    });
  });
});

describe('Mobile Profile trait onboarding CTA', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('renders the CTA when the user has fewer than five base traits', async () => {
    __supabaseMock.setBaseTraitCount(2);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(__supabaseMock.supabase.auth.getUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Personality traits')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Finish onboarding')).toBeTruthy());
    expect(screen.getByText(/Add 3 more traits/i)).toBeTruthy();
  });

  it('hides the CTA once the base stack is complete', async () => {
    __supabaseMock.setBaseTraitCount(5);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(__supabaseMock.supabase.auth.getUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Personality traits')).toBeTruthy());
    await waitFor(() => {
      expect(screen.queryByText('Finish onboarding')).toBeNull();
    });
  });

  it('tracks analytics when the CTA is pressed', async () => {
    __supabaseMock.setBaseTraitCount(2);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Choose traits')).toBeTruthy());
    fireEvent.press(screen.getByText('Choose traits'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'profile-traits-banner',
      platform: 'mobile',
      step: 'traits',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding-traits',
    });
  });
});

describe('Mobile Profile reliability pledge CTA', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('renders the reliability CTA when no pledge record exists', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Reliability pledge')).toBeTruthy());
    expect(screen.getByText('Lock your reliability pledge')).toBeTruthy();
    expect(screen.getByText('Review pledge')).toBeTruthy();
  });

  it('shows the success copy once the pledge is acknowledged', async () => {
    profileState.profileRow.reliability_pledge_ack_at = '2025-12-01T00:00:00.000Z';
    profileState.profileRow.reliability_pledge_version = 'v2';

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.queryByText('Review pledge')).toBeNull());
    expect(screen.getByText(/You accepted version v2/i)).toBeTruthy();
  });

  it('tracks analytics when the reliability CTA is pressed', async () => {
    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Review pledge')).toBeTruthy());
    fireEvent.press(screen.getByText('Review pledge'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'profile-pledge-banner',
      platform: 'mobile',
      step: 'pledge',
      steps: ['traits', 'sport', 'pledge'],
      pendingSteps: 3,
      nextStep: '/onboarding/reliability-pledge',
    });
  });
});

describe('Mobile Profile onboarding progress banner', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('surfaces the prioritized trait step when multiple tasks remain', async () => {
    __supabaseMock.setBaseTraitCount(2);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Finish your Social Sweat onboarding')).toBeTruthy());
    expect(screen.getByText(/Next up: Pick 5 base traits/i)).toBeTruthy();
    expect(screen.getByText('Go to next step')).toBeTruthy();
    expect(screen.getAllByText('Pick 5 base traits').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Set your sport & skill').length).toBeGreaterThan(0);
    expect(screen.getByText('Confirm the reliability pledge')).toBeTruthy();
  });

  it('tracks telemetry for the prioritized step when the progress button is pressed', async () => {
    __supabaseMock.setBaseTraitCount(5);

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText(/Next up: Set your sport & skill/i)).toBeTruthy());
    fireEvent.press(screen.getByText('Go to next step'));

    expect(trackOnboardingEntry).toHaveBeenCalledWith({
      source: 'profile-progress-banner',
      platform: 'mobile',
      step: 'sport',
      steps: ['sport', 'pledge'],
      pendingSteps: 2,
      nextStep: '/onboarding/sports',
    });
  });
});

describe('Mobile Profile reliability card', () => {
  beforeEach(() => {
    resetTestState();
  });

  it('shows a loading indicator while metrics resolve', async () => {
    const deferred = createDeferredReliabilityFetch();

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Loading reliability…')).toBeTruthy());

    await act(async () => {
      deferred.resolve({ reliability: null, attendance: null });
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Need to contest a mark? Open the session once it ends and use the “Contest reliability” button to send details.',
        ),
      ).toBeTruthy(),
    );
  });

  it('renders reliability metrics when the fetch succeeds', async () => {
    configureReliabilitySuccess({
      reliability: {
        score: 92,
        confidence: 0.8,
      },
      attendance: {
        attended30: 7,
        noShow30: 1,
        lateCancel30: 0,
        excused30: 0,
        attended90: 12,
        noShow90: 2,
        lateCancel90: 1,
        excused90: 0,
      },
    });

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Reliability index')).toBeTruthy());
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('7 / 8 · 88%')).toBeTruthy();
    expect(screen.getByText('2 · 13%')).toBeTruthy();
  });

  it('shows an error message when the metrics request fails', async () => {
    configureReliabilityFailure(500, { error: 'nope' });

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('Failed to load reliability (500)')).toBeTruthy());
  });

  it('guides members to attend sessions before the score is ready', async () => {
    configureReliabilitySuccess({ reliability: null, attendance: null });

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() =>
      expect(
        screen.getByText(
          'Attend a few confirmed sessions and check in so we can calculate your reliability score.',
        ),
      ).toBeTruthy(),
    );
  });

  it('opens the attendance log when the CTA is pressed', async () => {
    configureReliabilitySuccess({
      reliability: { score: 75, confidence: 0.5 },
      attendance: {
        attended30: 3,
        noShow30: 0,
        lateCancel30: 0,
        excused30: 0,
        attended90: 5,
        noShow90: 0,
        lateCancel90: 0,
        excused90: 0,
      },
    });

    render(<ProfileScreen />);
    await act(async () => {});

    await waitFor(() => expect(screen.getByText('View attendance log')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading reliability…')).toBeNull());
    const attendanceButton = screen
      .UNSAFE_getAllByType(Pressable)
      .find((instance) => instance.props.testID === 'profile-attendance-log-button');
    expect(attendanceButton?.props.onPress).toBeInstanceOf(Function);

    await act(async () => {
      attendanceButton?.props.onPress?.();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(trackReliabilityAttendanceLogViewed).toHaveBeenCalledWith({
        platform: 'mobile',
        surface: 'profile-reliability-card',
      }),
    );
    await waitFor(() =>
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://example.org/my/attendance'),
    );
    expect(trackReliabilityAttendanceLogViewed).toHaveBeenCalledWith({
      platform: 'mobile',
      surface: 'profile-reliability-card',
    });
  });
});
