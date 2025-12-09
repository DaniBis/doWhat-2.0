import type { ActivityName } from '@/lib/venues/constants';

const YOGA_ACTIVITY = 'Yoga Flow' as ActivityName;
const PICKLEBALL_ACTIVITY = 'Pickleball' as ActivityName;

jest.mock('@/lib/venues/constants', () => ({
  ACTIVITY_NAMES: [YOGA_ACTIVITY, PICKLEBALL_ACTIVITY],
}));

jest.mock('@dowhat/shared', () => ({
  activityTaxonomy: [
    {
      id: 'tier1-body',
      label: 'Body',
      description: 'Body focus',
      iconKey: 'body',
      colorToken: 'body-color',
      tags: [],
      children: [
        {
          id: 'tier2-movement',
          label: 'Movement',
          description: 'Movement activities',
          tags: [],
          children: [
            { id: 'tier3-yoga', label: 'Yoga Flow', description: 'Yoga', tags: [] },
            { id: 'tier3-hike', label: 'Hiking', description: 'Hike', tags: [] },
          ],
        },
      ],
    },
    {
      id: 'tier1-fun',
      label: 'Fun',
      description: 'Fun focus',
      iconKey: 'fun',
      colorToken: 'fun-color',
      tags: [],
      children: [
        {
          id: 'tier2-games',
          label: 'Games',
          description: 'Game activities',
          tags: [],
          children: [
            { id: 'tier3-pickleball', label: 'Pickleball', description: 'Pickleball', tags: [] },
          ],
        },
      ],
    },
  ],
  defaultTier3Index: [
    {
      id: 'tier3-yoga',
      label: 'Yoga Flow',
      description: 'Yoga',
      tags: [],
      tier1Label: 'Body',
      tier1Id: 'tier1-body',
      tier2Id: 'tier2-movement',
      tier2Label: 'Movement',
    },
    {
      id: 'tier3-pickleball',
      label: 'Pickleball',
      description: 'Pickleball',
      tags: [],
      tier1Label: 'Fun',
      tier1Id: 'tier1-fun',
      tier2Id: 'tier2-games',
      tier2Label: 'Games',
    },
    {
      id: 'tier3-hike',
      label: 'Hiking',
      description: 'Hiking',
      tags: [],
      tier1Label: 'Outdoors',
      tier1Id: 'tier1-outdoors',
      tier2Id: 'tier2-trails',
      tier2Label: 'Trails',
    },
  ],
}));

import { buildVenueTaxonomySupport, __private__ } from '../taxonomySupport';

describe('buildVenueTaxonomySupport', () => {
  it('filters taxonomy to only supported tier3 ids', () => {
    const support = buildVenueTaxonomySupport();
    expect(support.taxonomy).toHaveLength(2);
    const body = support.taxonomy[0];
    const bodyTier2 = body.children[0]!;
    expect(bodyTier2.children).toEqual([{ id: 'tier3-yoga', label: 'Yoga Flow' }]);
    const fun = support.taxonomy[1];
    const funTier2 = fun.children[0]!;
    expect(funTier2.children).toEqual([{ id: 'tier3-pickleball', label: 'Pickleball' }]);
  });

  it('maps activity names and tier3 ids bidirectionally', () => {
    const support = buildVenueTaxonomySupport();
    const yoga = support.tier3ByActivity.get(YOGA_ACTIVITY);
    expect(yoga).toBeDefined();
    expect(yoga?.id).toBe('tier3-yoga');
    expect(support.activityNameByTier3Id.get('tier3-pickleball')).toBe(PICKLEBALL_ACTIVITY);
    const tier3Yoga = support.tier3ById.get('tier3-yoga');
    expect(tier3Yoga).toBeDefined();
    expect(tier3Yoga?.label).toBe('Yoga Flow');
  });
});

describe('normaliseLabel', () => {
  it('lowercases and trims strings', () => {
    expect(__private__.normaliseLabel('  Yoga Flow ')).toBe('yoga flow');
  });
});
