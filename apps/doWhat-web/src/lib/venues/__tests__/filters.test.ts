import { filterVenues, filterVenuesBySignals, filterVenuesByStatus, type StatusFilter } from '../filters';
import type { RankedVenueActivity } from '../types';
import type { ActivityName } from '@/lib/venues/constants';

const DEFAULT_ACTIVITY = 'yoga' as ActivityName;

let seedCounter = 0;
const buildVenue = (overrides: Partial<RankedVenueActivity> = {}): RankedVenueActivity => {
  seedCounter += 1;
  return {
    venueId: overrides.venueId ?? `venue-${seedCounter}`,
    venueName: overrides.venueName ?? `Venue ${seedCounter}`,
    lat: overrides.lat ?? 0,
    lng: overrides.lng ?? 0,
    displayAddress: overrides.displayAddress ?? null,
    primaryCategories: overrides.primaryCategories ?? [],
    rating: overrides.rating ?? null,
    priceLevel: overrides.priceLevel ?? null,
    photoUrl: overrides.photoUrl ?? null,
    openNow: overrides.openNow ?? null,
    hoursSummary: overrides.hoursSummary ?? null,
    activity: overrides.activity ?? DEFAULT_ACTIVITY,
    aiConfidence: overrides.aiConfidence ?? 0.5,
    userYesVotes: overrides.userYesVotes ?? 0,
    userNoVotes: overrides.userNoVotes ?? 0,
    categoryMatch: overrides.categoryMatch ?? false,
    keywordMatch: overrides.keywordMatch ?? false,
    score: overrides.score ?? 0.5,
    verified: overrides.verified ?? false,
    needsVerification: overrides.needsVerification ?? false,
  };
};

describe('filterVenuesByStatus', () => {
  const dataset = [
    buildVenue({ venueId: 'verified', verified: true }),
    buildVenue({ venueId: 'needs', needsVerification: true }),
    buildVenue({ venueId: 'ai' }),
  ];

  const pickIds = (venues: RankedVenueActivity[]) => venues.map((venue) => venue.venueId);

  it.each<StatusFilter>(['all', 'verified', 'needs_review', 'ai_only'])('filters %s list', (status) => {
    const filtered = filterVenuesByStatus(dataset, status);
    const ids = pickIds(filtered);
    switch (status) {
      case 'verified':
        expect(ids).toEqual(['verified']);
        break;
      case 'needs_review':
        expect(ids).toEqual(['needs']);
        break;
      case 'ai_only':
        expect(ids).toEqual(['ai']);
        break;
      default:
        expect(ids).toEqual(['verified', 'needs', 'ai']);
        break;
    }
  });
});

describe('filterVenuesBySignals', () => {
  it('returns original list when no filters active', () => {
    const venues = [buildVenue(), buildVenue()];
    expect(filterVenuesBySignals(venues, {})).toEqual(venues);
  });

  it('filters by openNow flag', () => {
    const venues = [
      buildVenue({ venueId: 'closed', openNow: false }),
      buildVenue({ venueId: 'open', openNow: true }),
    ];
    const filtered = filterVenuesBySignals(venues, { onlyOpenNow: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].venueId).toBe('open');
  });

  it('filters by presence of votes', () => {
    const venues = [
      buildVenue({ venueId: 'no-votes' }),
      buildVenue({ venueId: 'with-votes', userYesVotes: 2 }),
    ];
    const filtered = filterVenuesBySignals(venues, { onlyWithVotes: true });
    expect(filtered.map((venue) => venue.venueId)).toEqual(['with-votes']);
  });

  it('requires category and keyword signal toggles', () => {
    const venues = [
      buildVenue({ venueId: 'category', categoryMatch: true }),
      buildVenue({ venueId: 'keyword', keywordMatch: true }),
      buildVenue({ venueId: 'both', categoryMatch: true, keywordMatch: true }),
    ];
    const categoryOnly = filterVenuesBySignals(venues, { categorySignalOnly: true });
    expect(categoryOnly.map((venue) => venue.venueId)).toEqual(['category', 'both']);

    const keywordOnly = filterVenuesBySignals(venues, { keywordSignalOnly: true });
    expect(keywordOnly.map((venue) => venue.venueId)).toEqual(['keyword', 'both']);
  });

  it('matches rounded price levels and drops unpriced venues', () => {
    const venues = [
      buildVenue({ venueId: 'cheap', priceLevel: 1.2 }),
      buildVenue({ venueId: 'mid', priceLevel: 2.6 }),
      buildVenue({ venueId: 'expensive', priceLevel: 4 }),
      buildVenue({ venueId: 'unknown', priceLevel: null }),
    ];
    const filtered = filterVenuesBySignals(venues, { priceLevelFilters: [1, 4] });
    expect(filtered.map((venue) => venue.venueId)).toEqual(['cheap', 'expensive']);
  });

  it('applies stacked filters together', () => {
    const venues = [
      buildVenue({
        venueId: 'match',
        openNow: true,
        userYesVotes: 1,
        categoryMatch: true,
        keywordMatch: true,
        priceLevel: 2,
      }),
      buildVenue({
        venueId: 'fails-votes',
        openNow: true,
        categoryMatch: true,
        keywordMatch: true,
        priceLevel: 2,
      }),
    ];

    const filtered = filterVenuesBySignals(venues, {
      onlyOpenNow: true,
      onlyWithVotes: true,
      categorySignalOnly: true,
      keywordSignalOnly: true,
      priceLevelFilters: [2],
    });

    expect(filtered.map((venue) => venue.venueId)).toEqual(['match']);
  });
});

describe('filterVenues (combined)', () => {
  it('applies status and signal filters in sequence', () => {
    const venues = [
      buildVenue({ venueId: 'verified-open', verified: true, openNow: true, userYesVotes: 1 }),
      buildVenue({ venueId: 'verified-closed', verified: true, userYesVotes: 1 }),
      buildVenue({ venueId: 'ai-open', openNow: true }),
    ];

    const filtered = filterVenues(venues, 'verified', { onlyOpenNow: true, onlyWithVotes: true });
    expect(filtered.map((venue) => venue.venueId)).toEqual(['verified-open']);
  });
});
