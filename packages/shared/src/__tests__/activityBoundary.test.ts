import { describe, expect, it } from '@jest/globals';

import { evaluateActivityFirstDiscoveryPolicy, stripHospitalityFirstDiscoverySelections } from '../discovery';

describe('activity-first discovery boundary', () => {
  it('rejects hospitality-only places without activity evidence', () => {
    expect(
      evaluateActivityFirstDiscoveryPolicy({
        name: 'Lotus Cafe',
        categories: ['coffee'],
        tags: ['cafe'],
      }),
    ).toMatchObject({
      isEligible: false,
      isHospitalityPrimary: true,
      hasActivityCategoryEvidence: false,
    });
  });

  it('keeps hospitality venues when structured activity evidence exists', () => {
    expect(
      evaluateActivityFirstDiscoveryPolicy({
        name: 'Knights Board Game Cafe',
        categories: ['coffee'],
        tags: ['board-game', 'community'],
      }),
    ).toMatchObject({
      isEligible: true,
      hasActivityCategoryEvidence: true,
    });
  });

  it('strips blocked hospitality-first discovery selections', () => {
    expect(
      stripHospitalityFirstDiscoverySelections([
        'nightlife',
        'specialty-coffee-crawls',
        'climbing-bouldering-labs',
        'community',
      ]),
    ).toEqual(['climbing_bouldering_labs', 'community']);
  });
});
