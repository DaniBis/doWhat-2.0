import type { SupabaseClient } from '@supabase/supabase-js';

import { enrichVenueActivities } from '@/lib/venues/enrichment';
import * as providerModule from '@/lib/venues/providers';
import type { ExternalVenueRecord } from '@/lib/venues/types';
import type { Database } from '@/types/database';

jest.mock('openai', () => {
  const responsesCreate = jest.fn();
  const ctor = jest.fn().mockImplementation(() => ({
    responses: {
      create: responsesCreate,
    },
  }));
  return {
    __esModule: true,
    default: ctor,
    __responsesCreate: responsesCreate,
  };
});

jest.mock('@/lib/venues/providers', () => {
  const actual = jest.requireActual('@/lib/venues/providers');
  return {
    ...actual,
    fetchFoursquareVenue: jest.fn(),
    fetchGooglePlace: jest.fn(),
  };
});

const {
  default: mockOpenAIConstructor,
  __responsesCreate: mockResponsesCreate,
} = jest.requireMock('openai') as {
  default: jest.Mock;
  __responsesCreate: jest.Mock;
};

const fetchFoursquareVenueMock = providerModule.fetchFoursquareVenue as jest.MockedFunction<
  typeof providerModule.fetchFoursquareVenue
>;
const fetchGooglePlaceMock = providerModule.fetchGooglePlace as jest.MockedFunction<
  typeof providerModule.fetchGooglePlace
>;

type VenueRow = Database['public']['Tables']['venues']['Row'];
type VenueUpdate = Database['public']['Tables']['venues']['Update'];

describe('enrichVenueActivities', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    jest.restoreAllMocks();
  });

  test('updates venue with provider data and classification output', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));

    const existingVenue = createVenue();
    const updatedVenue: VenueRow = {
      ...existingVenue,
      raw_description: 'Indoor climbing gym with fresh bouldering sets.\n' + existingVenue.name,
      raw_reviews: ['Great routes', 'Friendly staff'],
      ai_activity_tags: ['climbing'],
      ai_confidence_scores: { climbing: 0.97 },
      last_ai_update: new Date().toISOString(),
      needs_verification: true,
      lat: 13.75,
      lng: 100.54,
    };

    const { supabase, getUpdatePayload, updateMock } = createSupabaseStub(existingVenue, updatedVenue);

    const providerRecord: ExternalVenueRecord = {
      provider: 'foursquare',
      providerId: 'fsq-123',
      name: 'Dowhat Climb Lab',
      description: 'Indoor climbing gym with fresh bouldering sets.',
      categories: ['climbing'],
      keywords: ['climbing', 'bouldering'],
      rating: 4.8,
      priceLevel: 2,
      lat: 13.75,
      lng: 100.54,
      photos: [],
      reviews: ['Great routes', 'Friendly staff'],
    };

    fetchFoursquareVenueMock.mockResolvedValue(providerRecord);
    fetchGooglePlaceMock.mockResolvedValue(null);

    mockResponsesCreate.mockResolvedValue({
      output_text: ['{"tags":["climbing"],"confidence":{"climbing":0.97}}'],
    });

    const result = await enrichVenueActivities({
      supabase,
      venueId: existingVenue.id,
      foursquareId: 'fsq-123',
      googlePlaceId: null,
      force: false,
    });

    expect(providerModule.fetchFoursquareVenue).toHaveBeenCalledWith(
      expect.objectContaining({ fsqId: 'fsq-123', venueId: existingVenue.id }),
    );
    expect(mockOpenAIConstructor).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);

    const payload = getUpdatePayload();
    expect(payload).toMatchObject({
      raw_description: expect.stringContaining('Indoor climbing gym'),
      raw_reviews: ['Great routes', 'Friendly staff'],
      ai_activity_tags: ['climbing'],
      ai_confidence_scores: { climbing: 0.97 },
      needs_verification: true,
      lat: 13.75,
      lng: 100.54,
    });

    expect(result.refreshed).toBe(true);
    expect(result.classification?.tags).toEqual(['climbing']);
    expect(result.venue).toEqual(updatedVenue);
  });

  test('skips classification when data is fresh and tags exist', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));

    const existingVenue = createVenue({
      ai_activity_tags: ['climbing'],
      last_ai_update: new Date().toISOString(),
      raw_description: 'Existing description',
      raw_reviews: ['Existing review'],
    });

    const { supabase, updateMock } = createSupabaseStub(existingVenue, existingVenue);

    const result = await enrichVenueActivities({
      supabase,
      venueId: existingVenue.id,
      foursquareId: null,
      googlePlaceId: null,
      force: false,
    });

    expect(fetchFoursquareVenueMock).not.toHaveBeenCalled();
    expect(fetchGooglePlaceMock).not.toHaveBeenCalled();
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
    expect(result.providerDiagnostics).toContain('classification:skipped-up-to-date');
  });
});

function createVenue(overrides: Partial<VenueRow> = {}): VenueRow {
  return {
    id: overrides.id ?? 'venue-123',
    name: overrides.name ?? 'Dowhat Venue',
    address: overrides.address ?? null,
    lat: overrides.lat ?? null,
    lng: overrides.lng ?? null,
    metadata: overrides.metadata ?? null,
    raw_description: overrides.raw_description ?? null,
    raw_reviews: overrides.raw_reviews ?? null,
    ai_activity_tags: overrides.ai_activity_tags ?? [],
    ai_confidence_scores: overrides.ai_confidence_scores ?? null,
    verified_activities: overrides.verified_activities ?? [],
    last_ai_update: overrides.last_ai_update ?? null,
    needs_verification: overrides.needs_verification ?? false,
    created_at: overrides.created_at ?? null,
    updated_at: overrides.updated_at ?? null,
  };
}

function createSupabaseStub(existing: VenueRow, updated?: VenueRow) {
  let lastUpdatePayload: VenueUpdate | null = null;

  const selectSingleMock = jest.fn().mockResolvedValue({ data: existing, error: null });
  const selectEqMock = jest.fn().mockReturnValue({ single: selectSingleMock });
  const selectMock = jest.fn().mockReturnValue({ eq: selectEqMock });

  const updateSingleMock = jest.fn().mockResolvedValue({ data: updated ?? existing, error: null });
  const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
  const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
  const updateMock = jest.fn((payload: VenueUpdate) => {
    lastUpdatePayload = payload;
    return { eq: updateEqMock };
  });

  const fromMock = jest.fn(() => ({
    select: selectMock,
    update: updateMock,
  }));

  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return {
    supabase,
    getUpdatePayload: () => lastUpdatePayload,
    updateMock,
  };
}
