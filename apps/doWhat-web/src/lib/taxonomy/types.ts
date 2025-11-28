import type { ActivityTaxonomy } from '@dowhat/shared';

export type TaxonomyFlatRow = {
  tier1_id: string;
  tier1_label: string;
  tier1_description: string;
  tier1_tags: string[];
  tier1_icon_key: string;
  tier1_color_token: string;
  tier1_weight: number;
  tier2_id: string;
  tier2_label: string;
  tier2_description: string;
  tier2_tags: string[];
  tier2_icon_key: string | null;
  tier2_weight: number;
  tier3_id: string;
  tier3_label: string;
  tier3_description: string;
  tier3_tags: string[];
  tier3_icon_key: string | null;
  tier3_weight: number;
};

export type TaxonomyStateRow = {
  version: string;
  updated_at: string;
};

export type TaxonomyFetchResult = {
  taxonomy: ActivityTaxonomy;
  version: string;
  fetchedAt: number;
};
