import { describe, expect, it } from '@jest/globals';

import {
  WRITE_TARGETS,
  cleanRecord,
  firstTrimmedString,
  normaliseSavedActivityRow,
  shouldFallback,
} from '../index';

describe('savedActivities helpers', () => {
  it('cleanRecord removes undefined values but preserves nulls', () => {
    const input = { id: 'abc', name: undefined, address: null, city: 'bkk' };
    expect(cleanRecord(input)).toEqual({ id: 'abc', address: null, city: 'bkk' });
  });

  it('firstTrimmedString returns the first non-empty trimmed string', () => {
    const candidates = [null, '   ', '  Bangkok ', 'Chiang Mai'];
    expect(firstTrimmedString(candidates)).toBe('Bangkok');
  });

  it('normaliseSavedActivityRow returns a SavedPlace with trimmed metadata', () => {
    const row = {
      place_id: 'place-123',
      place_name: '  Rooftop Hangout  ',
      venue_name: '  Duplicate Name  ',
      venue_address: '  90 Rama I Rd ',
      sessions_count: 4,
      city_slug: 'bkk',
      venue_id: 'venue-123',
      metadata: { source: 'test' },
      updated_at: '2025-12-04T10:00:00Z',
    };
    expect(normaliseSavedActivityRow(row)).toEqual({
      placeId: 'place-123',
      name: 'Rooftop Hangout',
      address: '90 Rama I Rd',
      citySlug: 'bkk',
      venueId: 'venue-123',
      sessionsCount: 4,
      updatedAt: '2025-12-04T10:00:00Z',
      metadata: { source: 'test' },
    });
  });

  it('normaliseSavedActivityRow returns null when place id missing', () => {
    expect(normaliseSavedActivityRow({})).toBeNull();
  });

  it('shouldFallback matches known Supabase missing relation errors', () => {
    expect(shouldFallback(new Error('relation user_saved_activities does not exist'))).toBe(true);
    expect(shouldFallback(new Error('random failure'))).toBe(false);
  });

  it('WRITE_TARGETS user_saved_activities derives venue_id from UUID payload id', () => {
    const userId = 'user-1';
    const payload = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Cafe',
    };
    const insert = WRITE_TARGETS[0].buildInsert(userId, payload);
    expect(insert).toMatchObject({
      user_id: 'user-1',
      place_id: payload.id,
      venue_id: payload.id,
      place_name: 'Cafe',
    });
  });
});
