export type TaxonomyTag = string;

export type ActivityTier3Category = {
  id: string;
  label: string;
  description: string;
  tags: TaxonomyTag[];
  iconKey?: string;
  defaultDurationMinutes?: number;
};

export type ActivityTier2Category = {
  id: string;
  label: string;
  description: string;
  tags: TaxonomyTag[];
  iconKey?: string;
  children: ActivityTier3Category[];
};

export type ActivityTier1Category = {
  id: string;
  label: string;
  description: string;
  iconKey: string;
  colorToken: string;
  tags: TaxonomyTag[];
  children: ActivityTier2Category[];
};

export type ActivityTaxonomy = ActivityTier1Category[];

export type ActivityTier3WithAncestors = ActivityTier3Category & {
  tier2Id: string;
  tier2Label: string;
  tier1Id: string;
  tier1Label: string;
};

export type ActivityTagLookup = Map<string, ActivityTier3WithAncestors>;
