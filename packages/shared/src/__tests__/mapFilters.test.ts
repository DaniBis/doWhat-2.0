import {
  DEFAULT_MAP_FILTER_PREFERENCES,
  mapPreferencesToQueryFilters,
  normaliseMapFilterPreferences,
} from '../preferences/mapFilters';

describe('map filter preferences', () => {
  it('normalizes trust mode and strips invalid values', () => {
    expect(
      normaliseMapFilterPreferences({
        ...DEFAULT_MAP_FILTER_PREFERENCES,
        activityTypes: ['climbing', 'climbing'],
        traits: ['curious', ' curious '],
        trustMode: 'verified_only',
      }),
    ).toEqual({
      ...DEFAULT_MAP_FILTER_PREFERENCES,
      activityTypes: ['climbing'],
      traits: ['curious'],
      trustMode: 'verified_only',
    });

    expect(
      normaliseMapFilterPreferences({
        ...DEFAULT_MAP_FILTER_PREFERENCES,
        trustMode: 'unsupported' as never,
      }),
    ).toEqual(DEFAULT_MAP_FILTER_PREFERENCES);
  });

  it('maps trust mode into the shared discovery contract', () => {
    expect(
      mapPreferencesToQueryFilters({
        ...DEFAULT_MAP_FILTER_PREFERENCES,
        taxonomyCategories: ['fitness_climbing'],
        trustMode: 'verified_only',
      }),
    ).toEqual({
      taxonomyCategories: ['fitness_climbing'],
      trustMode: 'verified_only',
    });
  });
});
