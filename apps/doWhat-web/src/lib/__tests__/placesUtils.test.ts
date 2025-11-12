import { expandCategoryAliases } from '../places/categories';
import { haversineMeters, jaroWinklerSimilarity, nameSimilarity, slugFromNameAndCoords } from '../places/utils';

describe('places utils', () => {
  test('haversineMeters computes reasonable distance', () => {
    const distance = haversineMeters(13.7563, 100.5018, 13.7463, 100.5218);
    expect(distance).toBeGreaterThan(2000);
    expect(distance).toBeLessThan(3000);
  });

  test('nameSimilarity handles common abbreviations', () => {
    expect(nameSimilarity('Bangkok Sports Center', 'Bangkok Sports Ctr.')).toBeGreaterThan(0.6);
    expect(nameSimilarity('Community Hall', 'Night Market')).toBeLessThan(0.3);
  });

  test('jaroWinklerSimilarity identifies close matches', () => {
    expect(jaroWinklerSimilarity('The Club Bangkok', 'The Club')).toBeGreaterThanOrEqual(0.9);
    expect(jaroWinklerSimilarity('Yoga Studio', 'Climbing Gym')).toBeLessThan(0.7);
  });

  test('slugFromNameAndCoords produces deterministic slug', () => {
    const slugA = slugFromNameAndCoords('Dowhat Hub', 13.75, 100.5);
    const slugB = slugFromNameAndCoords('Dowhat Hub', 13.75, 100.5);
    expect(slugA).toEqual(slugB);
    expect(slugA).toContain('dowhat-hub');
  });

  test('expandCategoryAliases returns empty array for empty input', () => {
    expect(expandCategoryAliases(null)).toEqual([]);
    expect(expandCategoryAliases([])).toEqual([]);
    expect(expandCategoryAliases(['  '])).toEqual([]);
  });

  test('expandCategoryAliases expands wildcards to full set', () => {
    const categories = expandCategoryAliases(['all']);
    expect(categories).toContain('outdoors');
    expect(categories).toContain('fitness');
    expect(categories.length).toBeGreaterThan(10);
  });

  test('expandCategoryAliases normalizes aliases', () => {
    expect(expandCategoryAliases(['Coffee ', '  GYM '])).toEqual(['coffee', 'fitness']);
  });

  test('expandCategoryAliases includes pilot activity aliases', () => {
    expect(expandCategoryAliases(['badminton'])).toContain('fitness');
    expect(expandCategoryAliases(['rock_climbing'])).toContain('fitness');
  });
});
