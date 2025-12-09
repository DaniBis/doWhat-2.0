import {
  buildCreateEventQuery,
  buildPrefillContextSummary,
  buildSessionCloneQuery,
  normaliseCategoryIds,
  type SessionCloneSource,
} from '@/lib/adminPrefill';
import type { RankedVenueActivity } from '@/lib/venues/types';

describe('adminPrefill helpers', () => {
  const baseVenue: RankedVenueActivity = {
    venueId: 'venue-1',
    venueName: 'Test Venue',
    lat: 12.345678,
    lng: -98.765432,
    displayAddress: '123 Main St',
    primaryCategories: ['Studio'],
    rating: 4.6,
    priceLevel: 2,
    photoUrl: null,
    openNow: true,
    hoursSummary: '10am – 8pm',
    activity: 'yoga',
    aiConfidence: 0.87,
    userYesVotes: 12,
    userNoVotes: 1,
    categoryMatch: true,
    keywordMatch: true,
    score: 91,
    verified: true,
    needsVerification: false,
  };

  it('buildCreateEventQuery includes coordinates, address, and taxonomy metadata', () => {
    const query = buildCreateEventQuery(baseVenue, 'Yoga', {
      categoryIds: [' tier-1 ', 'tier-1', 'tier-2'],
      source: 'test_source',
    });

    expect(query).toMatchObject({
      venueId: 'venue-1',
      venueName: 'Test Venue',
      activityName: 'Yoga',
      lat: '12.345678',
      lng: '-98.765432',
      venueAddress: '123 Main St',
      categoryId: 'tier-1',
      categoryIds: 'tier-1,tier-2',
      source: 'test_source',
    });
  });

  it('buildCreateEventQuery falls back to default source and omits invalid coords', () => {
    const query = buildCreateEventQuery(
      { ...baseVenue, lat: null, lng: null, displayAddress: null },
      'Yoga',
      { categoryIds: [] },
    );

    expect(query).toEqual({
      venueId: 'venue-1',
      venueName: 'Test Venue',
      activityName: 'Yoga',
      source: 'venue_verification',
    });
  });

  it('buildPrefillContextSummary reflects taxonomy description and coordinates', () => {
    const summary = buildPrefillContextSummary(baseVenue, 'Yoga', 'Hot Yoga • Movement');
    expect(summary).toBe('Yoga • Hot Yoga • Movement • 12.3457, -98.7654');
  });

  it('buildPrefillContextSummary returns activity label when venue missing', () => {
    expect(buildPrefillContextSummary(null, 'Yoga', 'Any Category')).toBe('Yoga');
  });

  it('normaliseCategoryIds trims, dedupes, and skips blanks', () => {
    expect(normaliseCategoryIds([' a ', 'b', 'a', '', 'b'])).toEqual(['a', 'b']);
    expect(normaliseCategoryIds()).toEqual([]);
  });

  it('buildSessionCloneQuery includes activity, venue, and taxonomy data', () => {
    const source: SessionCloneSource = {
      activityId: 'act-1',
      activityName: 'Morning Flow',
      activityTypes: ['tier-1', 'tier-2'],
      venueId: 'ven-9',
      venueName: 'Flow Studio',
      venueAddress: '500 Sunset Blvd',
      venueLat: 1.234567,
      venueLng: -2.345678,
      priceCents: 2500,
      startsAt: '2025-12-05T09:00:00.000Z',
      endsAt: '2025-12-05T11:00:00.000Z',
    };

    const query = buildSessionCloneQuery(source, { source: 'admin_dashboard_clone' });

    expect(query).toMatchObject({
      activityId: 'act-1',
      activityName: 'Morning Flow',
      venueId: 'ven-9',
      venueName: 'Flow Studio',
      venueAddress: '500 Sunset Blvd',
      lat: '1.234567',
      lng: '-2.345678',
      price: '25',
      startsAt: '2025-12-05T09:00:00.000Z',
      endsAt: '2025-12-05T11:00:00.000Z',
      categoryId: 'tier-1',
      categoryIds: 'tier-1,tier-2',
      source: 'admin_dashboard_clone',
    });
  });

  it('buildSessionCloneQuery falls back gracefully when fields missing', () => {
    const query = buildSessionCloneQuery({
      activityName: 'Evening Flow',
      activityTypes: [null, ' '],
      priceCents: null,
      venueName: 'Night Studio',
    });

    expect(query).toEqual({
      source: 'admin_dashboard_session',
      activityName: 'Evening Flow',
      venueName: 'Night Studio',
    });
  });
});
