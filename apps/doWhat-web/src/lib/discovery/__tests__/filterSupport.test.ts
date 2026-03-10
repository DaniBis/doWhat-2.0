import {
  EMPTY_DISCOVERY_FILTER_SUPPORT,
  mergeDiscoveryFilterSupport,
} from '../engine-core';

describe('mergeDiscoveryFilterSupport', () => {
  test('treats unsupported fallback sources as additive gaps instead of disabling supported filters', () => {
    const activitiesSupport = {
      activityTypes: true,
      tags: true,
      traits: true,
      taxonomyCategories: true,
      priceLevels: true,
      capacityKey: true,
      timeWindow: true,
    };
    const venueFallbackSupport = {
      activityTypes: true,
      tags: true,
      traits: false,
      taxonomyCategories: false,
      priceLevels: false,
      capacityKey: false,
      timeWindow: false,
    };

    expect(mergeDiscoveryFilterSupport(activitiesSupport, venueFallbackSupport)).toEqual(activitiesSupport);
  });

  test('uses the empty support object as a neutral starting point', () => {
    const priceAndTimeSupport = {
      ...EMPTY_DISCOVERY_FILTER_SUPPORT,
      priceLevels: true,
      timeWindow: true,
    };

    expect(mergeDiscoveryFilterSupport(EMPTY_DISCOVERY_FILTER_SUPPORT, priceAndTimeSupport)).toEqual(priceAndTimeSupport);
  });
});
