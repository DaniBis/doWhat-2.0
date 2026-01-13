import type { RankedVenueActivity } from './types';

export type StatusFilter = 'all' | 'verified' | 'needs_review' | 'ai_only';

export type SignalFilters = {
  onlyOpenNow?: boolean;
  onlyWithVotes?: boolean;
  categorySignalOnly?: boolean;
  keywordSignalOnly?: boolean;
  priceLevelFilters?: number[];
};

const normalizePriceLevel = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(Math.max(Math.round(value), 1), 4);
};

const hasVotes = (venue: RankedVenueActivity) => (venue.userYesVotes + venue.userNoVotes) > 0;

export function filterVenuesByStatus(venues: RankedVenueActivity[], status: StatusFilter): RankedVenueActivity[] {
  switch (status) {
    case 'verified':
      return venues.filter((venue) => venue.verified);
    case 'needs_review':
      return venues.filter((venue) => venue.needsVerification);
    case 'ai_only':
      return venues.filter((venue) => !venue.verified && !venue.needsVerification);
    case 'all':
    default:
      return venues;
  }
}

export function filterVenuesBySignals(
  venues: RankedVenueActivity[],
  filters: SignalFilters,
): RankedVenueActivity[] {
  const {
    onlyOpenNow = false,
    onlyWithVotes = false,
    categorySignalOnly = false,
    keywordSignalOnly = false,
    priceLevelFilters = [],
  } = filters;

  if (!onlyOpenNow && !onlyWithVotes && !categorySignalOnly && !keywordSignalOnly && priceLevelFilters.length === 0) {
    return venues;
  }

  return venues.filter((venue) => {
    if (onlyOpenNow && venue.openNow !== true) return false;
    if (onlyWithVotes && !hasVotes(venue)) return false;
    if (categorySignalOnly && !venue.categoryMatch) return false;
    if (keywordSignalOnly && !venue.keywordMatch) return false;
    if (priceLevelFilters.length) {
      const normalized = normalizePriceLevel(venue.priceLevel);
      if (normalized == null || !priceLevelFilters.includes(normalized)) return false;
    }
    return true;
  });
}

export function filterVenues(
  venues: RankedVenueActivity[],
  status: StatusFilter,
  signalFilters: SignalFilters,
): RankedVenueActivity[] {
  return filterVenuesBySignals(filterVenuesByStatus(venues, status), signalFilters);
}

export const __testables__ = {
  normalizePriceLevel,
  hasVotes,
};
