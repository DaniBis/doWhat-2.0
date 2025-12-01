import { calculateActivityScore, resolveActivityConfidence, isActivityName, withinClassificationTTL } from '@/lib/venues/search';
import type { ActivityName } from '@/lib/venues/constants';

describe('venue search helpers', () => {
  test('calculateActivityScore applies weights correctly', () => {
    const score = calculateActivityScore({
      aiConfidence: 0.9,
      userYesVotes: 2,
      userNoVotes: 1,
      categoryMatch: true,
      keywordMatch: false,
    });
    // 0.9 * 0.6 + 20 - 10 + 15 = 25.54
    expect(score).toBeCloseTo(25.54, 2);
  });

  test('resolveActivityConfidence parses numeric values', () => {
    const scores = { climbing: 0.87, yoga: '0.65' } as const;
    const mixedScores: Record<string, unknown> = { ...scores };
    const yogaActivity: ActivityName = 'yoga';
    const tennisActivity: ActivityName = 'tennis';
    expect(resolveActivityConfidence(scores, 'climbing')).toBe(0.87);
    expect(resolveActivityConfidence(mixedScores, yogaActivity)).toBe(0.65);
    expect(resolveActivityConfidence(mixedScores, tennisActivity)).toBeNull();
  });

  test('isActivityName guards allowed values', () => {
    expect(isActivityName('climbing')).toBe(true);
    expect(isActivityName('random')).toBe(false);
    expect(isActivityName(123)).toBe(false);
  });

  test('withinClassificationTTL validates timestamps', () => {
    const fresh = new Date(Date.now() - 1000).toISOString();
    const stale = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    expect(withinClassificationTTL(fresh)).toBe(true);
    expect(withinClassificationTTL(stale)).toBe(false);
    expect(withinClassificationTTL(null)).toBe(false);
  });
});
