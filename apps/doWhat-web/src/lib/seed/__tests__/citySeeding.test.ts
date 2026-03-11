import { __citySeedingTestUtils } from '@/lib/seed/citySeeding';

describe('city seeding packs', () => {
  test('chess pack avoids hospitality-first seed terms', () => {
    const pack = __citySeedingTestUtils.getSeedPack('chess');
    expect(pack).not.toBeNull();
    expect(pack?.label).toBe('Chess clubs and community boards');
    expect(pack?.categories).toEqual(
      expect.arrayContaining(['community', 'chess', 'board_games']),
    );
    expect(pack?.categories).not.toEqual(expect.arrayContaining(['cafe chess']));
  });

  test('launch city packs resolve to city-category keys that drive activity-first provider queries', () => {
    expect(__citySeedingTestUtils.resolvePackCategories('hanoi', 'climbing_bouldering')).toEqual(['fitness', 'climbing_bouldering']);
    expect(__citySeedingTestUtils.resolvePackCategories('danang', 'running')).toEqual(['outdoors', 'running']);
    expect(__citySeedingTestUtils.resolvePackCategories('bangkok', 'climbing_bouldering')).toEqual(['fitness', 'rock_climbing']);
    expect(__citySeedingTestUtils.resolvePackCategories('bangkok', 'padel')).toEqual(['fitness', 'padel']);
  });
});
