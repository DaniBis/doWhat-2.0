import { describe, expect, it } from '@jest/globals';

import {
  evaluateCanonicalActivityMatch,
  evaluateLaunchVisibleActivityPlace,
  inferCanonicalActivities,
  resolveCanonicalActivityId,
} from '../index';

describe('activity intelligence matching', () => {
  it('resolves multilingual aliases to canonical ids', () => {
    expect(resolveCanonicalActivityId('สนามพาเดล')).toBe('padel');
    expect(resolveCanonicalActivityId('table tennis')).toBe('ping pong');
    expect(resolveCanonicalActivityId('โบลเดอร์')).toBe('bouldering');
  });

  it('rejects a generic park for a specific climbing query', () => {
    const result = evaluateCanonicalActivityMatch(
      'climbing',
      {
        name: 'West Lake Park',
        categories: ['park'],
        tags: ['green space'],
        venueTypes: ['park'],
        osmTags: { leisure: 'park' },
      },
      'specific',
    );

    expect(result.eligible).toBe(false);
  });

  it('rejects hospitality-first chess cafe results without strong evidence', () => {
    const result = evaluateCanonicalActivityMatch(
      'chess',
      {
        name: 'Chess Cafe',
        categories: ['cafe', 'coffee'],
        tags: ['pastries'],
      },
      'specific',
    );

    expect(result.eligible).toBe(false);
  });

  it('accepts explicit provider-backed climbing venues', () => {
    const result = evaluateCanonicalActivityMatch(
      'climbing',
      {
        name: 'VietClimb Hanoi',
        categories: ['sports_centre'],
        googleTypes: ['rock_climbing_gym'],
        osmTags: { sport: 'climbing', leisure: 'sports_centre' },
      },
      'specific',
    );

    expect(result.eligible).toBe(true);
    expect(result.strongEvidence).toBe(true);
  });

  it('suppresses community-centre browse matches for venue-bound activities without strong launch evidence', () => {
    expect(
      evaluateLaunchVisibleActivityPlace('dancing', {
        name: 'Hanoi Creative City',
        categories: ['community center'],
        tags: ['community centre'],
        venueTypes: ['community center'],
      }).visible,
    ).toBe(false);

    expect(
      evaluateLaunchVisibleActivityPlace('chess', {
        name: 'Community House',
        categories: ['community center'],
        tags: ['community centre'],
        venueTypes: ['community center'],
      }).visible,
    ).toBe(false);

    expect(
      evaluateLaunchVisibleActivityPlace('climbing', {
        name: 'Generic Sports Center',
        categories: ['sports centre'],
        tags: ['sports complex'],
        venueTypes: ['sports centre'],
      }).visible,
    ).toBe(false);

    expect(
      evaluateLaunchVisibleActivityPlace('climbing', {
        name: 'Beefy Boulders Tay Ho',
        description: '3 Ngo 55 Tu Lien | Beefy Boulders Tay Ho',
        tags: ['climbing', 'sports_centre'],
        taxonomyCategories: ['bouldering', 'climbing'],
        venueTypes: ['Beefy Boulders Tay Ho', 'sports_centre'],
        aiActivities: ['climbing'],
      }).visible,
    ).toBe(true);
  });

  it('allows area-compatible running browse matches on park or track shapes', () => {
    expect(
      evaluateLaunchVisibleActivityPlace('running', {
        name: 'West Lake Park',
        categories: ['park'],
        tags: ['green space'],
        venueTypes: ['park'],
        osmTags: { leisure: 'park' },
      }).visible,
    ).toBe(true);

    expect(
      evaluateLaunchVisibleActivityPlace('running', {
        name: 'National Running Track',
        categories: ['track'],
        tags: ['athletics'],
        venueTypes: ['running track'],
      }).visible,
    ).toBe(true);
  });

  it('infers browse activities without inventing unsupported consumerist noise', () => {
    const results = inferCanonicalActivities(
      {
        name: 'Hanoi Pottery Studio',
        categories: ['art studio'],
        tags: ['pottery', 'clay class'],
      },
      'browse',
      5,
    );

    expect(results.map((entry) => entry.activityId)).toEqual(expect.arrayContaining(['pottery', 'ceramics']));
    expect(results.map((entry) => entry.activityId)).not.toContain('chess');
  });
});
