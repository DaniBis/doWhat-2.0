import { debugDiscoverySearchText, matchesDiscoverySearchText, resolveDiscoverySearchIntentBuckets } from '../searchIntent';

describe('discovery search intent matching', () => {
  test('keeps real climbing intent and rejects generic sports centres for bouldering', () => {
    expect(
      matchesDiscoverySearchText(
        {
          name: 'VietClimb',
          tags: ['climbing', 'sports_centre'],
          activity_types: ['bouldering', 'climbing'],
          verification_state: 'verified',
        },
        'bouldering',
      ),
    ).toBe(true);

    expect(
      matchesDiscoverySearchText(
        {
          name: 'Trung tâm Thể thao Ba Đình',
          tags: ['sports_centre'],
          activity_types: ['running', 'badminton', 'basketball', 'climbing', 'padel'],
          verification_state: 'suggested',
        },
        'bouldering',
      ),
    ).toBe(false);
  });

  test('does not let martial arts query match crafts within community-centre rows', () => {
    expect(
      matchesDiscoverySearchText(
        {
          name: 'Hanoi Creative City',
          tags: ['community_centre'],
          activity_types: ['crafts', 'drawing', 'dancing'],
          verification_state: 'suggested',
        },
        'martial arts',
      ),
    ).toBe(false);
  });

  test('does not let running match suggested rows on activity_types alone', () => {
    expect(
      matchesDiscoverySearchText(
        {
          name: 'Phở Lẩu Thanh Hà 236-238 Lạc Trung',
          tags: ['vintage and thrift store'],
          activity_types: ['running'],
          verification_state: 'suggested',
        },
        'running',
      ),
    ).toBe(false);
  });

  test('drops ambiguous standalone pool from resolved intent buckets', () => {
    expect(resolveDiscoverySearchIntentBuckets('pool hall').map((bucket) => bucket.token)).toContain('pool hall');
    expect(resolveDiscoverySearchIntentBuckets('pool hall').map((bucket) => bucket.token)).not.toContain('pool');
  });

  test('billiards-oriented phrases do not match swimming pools', () => {
    expect(
      matchesDiscoverySearchText(
        {
          name: 'West Lake Swimming Pool',
          tags: ['swimming pool'],
          activity_types: ['swimming'],
          verification_state: 'verified',
        },
        'pool hall',
      ),
    ).toBe(false);
  });

  test('mixed billiards chess climb query matches only strong requested buckets', () => {
    expect(
      matchesDiscoverySearchText(
        {
          name: 'Olympic Swimming Pool',
          tags: ['swimming pool'],
          activity_types: ['swimming'],
          verification_state: 'verified',
        },
        'billiards chess climb',
      ),
    ).toBe(false);

    const probe = debugDiscoverySearchText(
      {
        name: 'VietClimb Indoor Gym',
        tags: ['climbing gym'],
        activity_types: ['climbing'],
        verification_state: 'verified',
      },
      'billiards chess climb',
    );

    expect(probe.matchedBuckets.map((bucket) => bucket.activityId)).toContain('climbing');
    expect(probe.matchedBuckets.flatMap((bucket) => bucket.evidenceSources)).toContain('exact_activity_type');
  });
});