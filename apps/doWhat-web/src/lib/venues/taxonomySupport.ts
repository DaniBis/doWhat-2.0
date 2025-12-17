import { ACTIVITY_NAMES, type ActivityName } from "@/lib/venues/constants";
import {
  activityTaxonomy,
  defaultTier3Index,
  type ActivityTaxonomy,
  type ActivityTier3WithAncestors,
} from "@dowhat/shared";

type NormaliseFn = (value: string) => string;

const normaliseLabel: NormaliseFn = (value) => value.trim().toLowerCase();

export type VenueTaxonomySupport = {
  taxonomy: ActivityTaxonomy;
  tier3ByActivity: Map<ActivityName, ActivityTier3WithAncestors>;
  activityNameByTier3Id: Map<string, ActivityName>;
  tier3ById: Map<string, ActivityTier3WithAncestors>;
};

export const buildVenueTaxonomySupport = (): VenueTaxonomySupport => {
  const allowedNames = new Map<string, ActivityName>();
  ACTIVITY_NAMES.forEach((name) => allowedNames.set(normaliseLabel(name), name));

  const tier3ByActivity = new Map<ActivityName, ActivityTier3WithAncestors>();
  const activityNameByTier3Id = new Map<string, ActivityName>();
  const tier3ById = new Map<string, ActivityTier3WithAncestors>();

  defaultTier3Index.forEach((entry) => {
    tier3ById.set(entry.id, entry);
    const match = allowedNames.get(normaliseLabel(entry.label));
    if (match) {
      tier3ByActivity.set(match, entry);
      activityNameByTier3Id.set(entry.id, match);
    }
  });

  const supportedIds = new Set(activityNameByTier3Id.keys());
  const taxonomy = activityTaxonomy
    .map((tier1) => {
      const tier2Children = tier1.children
        .map((tier2) => {
          const tier3Children = tier2.children.filter((tier3) => supportedIds.has(tier3.id));
          if (!tier3Children.length) return null;
          return { ...tier2, children: tier3Children };
        })
        .filter(Boolean) as ActivityTaxonomy[number]["children"];
      if (!tier2Children.length) return null;
      return { ...tier1, children: tier2Children };
    })
    .filter(Boolean) as ActivityTaxonomy;

  return { taxonomy, tier3ByActivity, activityNameByTier3Id, tier3ById };
};

export const __private__ = { normaliseLabel };
