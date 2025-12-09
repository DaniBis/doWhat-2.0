import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { RankedVenueActivity } from '@/lib/venues/types';
import VenueVerificationPage from '../page';

jest.mock('next/dynamic', () => () => () => null);

const saveToggleSpy = jest.fn();

jest.mock('@/components/SaveToggleButton', () => {
  return {
    __esModule: true,
    default: (props: { payload: unknown; size?: string }) => {
      saveToggleSpy(props);
      const payload = (props.payload as { id?: string })?.id ?? 'unknown';
      return (
        <button data-testid={`save-toggle-${payload}`}>Save stub</button>
      );
    },
  };
});

jest.mock('@/lib/venues/taxonomySupport', () => {
  const tier3Category = {
    id: 'tier3-chess',
    label: 'Chess',
    description: 'Board battles',
    tags: ['chess'],
  };
  const taxonomy = [
    {
      id: 'tier1-community',
      label: 'Community',
      description: 'Group experiences',
      iconKey: 'people',
      colorToken: 'emerald-500',
      tags: [],
      children: [
        {
          id: 'tier2-boardgames',
          label: 'Board games',
          description: 'Tabletop fun',
          tags: [],
          children: [tier3Category],
        },
      ],
    },
  ];
  const tier3WithAncestors = {
    ...tier3Category,
    tier2Id: 'tier2-boardgames',
    tier2Label: 'Board games',
    tier1Id: 'tier1-community',
    tier1Label: 'Community',
  };
  return {
    buildVenueTaxonomySupport: jest.fn(() => ({
      taxonomy,
      tier3ByActivity: new Map([[
        'chess',
        tier3WithAncestors,
      ]]),
      activityNameByTier3Id: new Map([[tier3Category.id, 'chess']]),
      tier3ById: new Map([[tier3Category.id, tier3WithAncestors]]),
    })),
  };
});

type FetchArgs = Parameters<typeof fetch>;

const resolveFetchUrl = (input: FetchArgs[0]) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const createJsonResponse = <T,>(data: T): Response => ({
  ok: true,
  status: 200,
  json: async () => data,
}) as Response;

const baseVenue: RankedVenueActivity = {
  venueId: 'venue-verified',
  venueName: 'Verified Venue',
  lat: 40.7128,
  lng: -74.006,
  displayAddress: '123 Verified St',
  primaryCategories: ['Studio'],
  rating: 4.8,
  priceLevel: 2,
  photoUrl: null,
  openNow: true,
  hoursSummary: '9am - 9pm',
  activity: 'chess',
  aiConfidence: 0.95,
  userYesVotes: 12,
  userNoVotes: 1,
  categoryMatch: true,
  keywordMatch: true,
  score: 92,
  verified: true,
  needsVerification: false,
};

const needsReviewVenue: RankedVenueActivity = {
  ...baseVenue,
  venueId: 'venue-review',
  venueName: 'Needs Review Venue',
  userYesVotes: 3,
  userNoVotes: 0,
  score: 78,
  verified: false,
  needsVerification: true,
};

const aiOnlyVenue: RankedVenueActivity = {
  ...baseVenue,
  venueId: 'venue-ai',
  venueName: 'AI Only Venue',
  userYesVotes: 0,
  userNoVotes: 0,
  score: 61,
  verified: false,
  needsVerification: false,
  categoryMatch: false,
  keywordMatch: false,
};

const venuesResponse = {
  activity: 'chess',
  results: [baseVenue, needsReviewVenue, aiOnlyVenue],
};

const summaryResponse = {
  activities: [
    {
      activity: 'chess',
      verifiedCount: 2,
      likelyCount: 1,
      possibleCount: 0,
      needsReviewCount: 1,
      averageConfidence: 0.88,
    },
  ],
};

const geolocationMock = {
  getCurrentPosition: jest.fn(),
};

const originalFetch = globalThis.fetch;
let fetchMock: jest.MockedFunction<typeof fetch>;

const defaultFetchHandler = async (...args: FetchArgs) => {
  const url = resolveFetchUrl(args[0]);
  if (url.includes('/api/list-activities')) {
    return createJsonResponse(summaryResponse);
  }
  if (url.includes('/api/search-venues')) {
    return createJsonResponse(venuesResponse);
  }
  throw new Error(`Unexpected fetch call for ${url}`);
};

beforeAll(() => {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: geolocationMock,
    configurable: true,
  });
});

beforeEach(() => {
  saveToggleSpy.mockClear();
  geolocationMock.getCurrentPosition.mockImplementation((success: Parameters<Geolocation['getCurrentPosition']>[0]) => {
    success({
      coords: {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 1,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
  });
  fetchMock = jest.fn(defaultFetchHandler) as jest.MockedFunction<typeof fetch>;
  (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  fetchMock?.mockReset();
});

afterAll(() => {
  if (originalFetch) {
    (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  }
});

const renderPage = () => render(<VenueVerificationPage />);

const findVenueList = async () => {
  return screen.findByRole('list');
};

describe('VenueVerificationPage', () => {
  it('filters venues via status chips', async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await findVenueList();
    expect(within(list).getByText('Verified Venue')).toBeInTheDocument();
    expect(within(list).getByText('Needs Review Venue')).toBeInTheDocument();
    expect(within(list).getByText('AI Only Venue')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Needs votes/i }));

    await waitFor(() => {
      expect(within(list).getByText('Needs Review Venue')).toBeInTheDocument();
    });
    expect(within(list).queryByText('Verified Venue')).not.toBeInTheDocument();
    expect(within(list).queryByText('AI Only Venue')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /AI only/i }));

    await waitFor(() => {
      expect(within(list).getByText('AI Only Venue')).toBeInTheDocument();
    });
    expect(within(list).queryByText('Needs Review Venue')).not.toBeInTheDocument();
  });

  it('propagates taxonomy metadata through save + plan actions', async () => {
    renderPage();

    const currentSelection = await screen.findByText(/Current selection:/i);
    expect(currentSelection).toHaveTextContent('Current selection: Chess • Community');

    await screen.findAllByText('Verified Venue');
    const planLinks = await screen.findAllByRole('link', { name: /Plan an event/i });
    expect(planLinks[0]).toHaveAttribute('href', expect.stringContaining('source=venue_verification_list'));

    const detailLink = await screen.findByRole('link', { name: /Create event/i });
    expect(detailLink).toHaveAttribute('href', expect.stringContaining('source=venue_verification_detail'));

    await waitFor(() => {
      expect(saveToggleSpy).toHaveBeenCalled();
    });

    const payloads = saveToggleSpy.mock.calls
      .map(([props]) => props.payload)
      .filter(Boolean) as Array<{ metadata?: Record<string, unknown>; id?: string }>;

    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[0]).toMatchObject({
      metadata: expect.objectContaining({
        source: 'venue_verification',
        activity: 'chess',
      }),
    });
  });

  it('surfaces vote feedback for success and auth errors', async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await findVenueList();
    const [firstVenueItem] = within(list).getAllByRole('listitem');
    const yesButton = (await screen.findAllByRole('button', { name: /Yes, it hosts this/i }))[0];
    const successPayload = {
      totals: { yes: 13, no: 1 },
      verification: { verifiedActivities: ['chess'], needsVerification: false },
    };

    fetchMock.mockImplementationOnce(async () => createJsonResponse(successPayload));

    await user.click(yesButton);

    await waitFor(() => {
      expect(screen.getByText(/Thanks! We\'ll highlight this venue./i)).toBeInTheDocument();
    });
    expect(within(firstVenueItem).getByText(/👍 13/)).toBeInTheDocument();

    const noButton = screen.getAllByRole('button', { name: /No, not available/i })[0];
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Please sign in to vote.' }),
    }) as Response);

    await user.click(noButton);

    await waitFor(() => {
      expect(screen.getByText(/Please sign in to vote/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Sign in to keep voting/i })).toBeInTheDocument();
  });

  it('syncs the detail drawer with selection metadata', async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await findVenueList();
    const needsReviewNode = within(list).getByText('Needs Review Venue');
    await user.click(needsReviewNode);

    const detailHeading = await screen.findByRole('heading', { name: 'Needs Review Venue' });
    expect(detailHeading).toBeInTheDocument();

    const detailLink = screen.getByRole('link', { name: /Create event/i });
    expect(detailLink).toHaveAttribute('href', expect.stringContaining('venueId=venue-review'));
    expect(detailLink).toHaveAttribute('href', expect.stringContaining('venueName=Needs+Review+Venue'));

    const detailSection = detailHeading.closest('section');
    if (!detailSection) {
      throw new Error('Detail section not found');
    }
    expect(within(detailSection).getByTestId('save-toggle-venue-review')).toBeInTheDocument();
    const prefillLine = within(detailSection).getByText(/Prefills:/i);
    expect(prefillLine.textContent).toContain('Chess');
    expect(prefillLine.textContent).toContain('Community');
  });
});
