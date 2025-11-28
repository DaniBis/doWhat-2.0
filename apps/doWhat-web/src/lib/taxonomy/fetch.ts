import type {
  ActivityTaxonomy,
  ActivityTier1Category,
  ActivityTier2Category,
  ActivityTier3Category,
} from '@dowhat/shared';
import { activityTaxonomy, activityTaxonomyVersion } from '@dowhat/shared';

import { createServiceClient } from '@/lib/supabase/service';

import type { TaxonomyFetchResult, TaxonomyFlatRow, TaxonomyStateRow } from './types';

const VIEW_NAME = 'v_activity_taxonomy_flat';
const STATE_TABLE = 'activity_taxonomy_state';

const isFlatRow = (row: Record<string, unknown>): row is TaxonomyFlatRow =>
  typeof row.tier1_id === 'string' && typeof row.tier3_id === 'string';

const isStateRow = (row: Record<string, unknown>): row is TaxonomyStateRow =>
  typeof row.version === 'string' && typeof row.updated_at === 'string';

export async function fetchRemoteTaxonomy(): Promise<TaxonomyFetchResult> {
  try {
    const client = createServiceClient();
    const { data: flatRows, error: flatError } = await client
      .from(VIEW_NAME)
      .select('*')
      .order('tier1_weight')
      .order('tier2_weight')
      .order('tier3_weight');
    if (flatError) throw flatError;
    if (!flatRows?.length) throw new Error('Taxonomy view returned no rows');
    const rows = flatRows.filter((row): row is TaxonomyFlatRow => isFlatRow(row as Record<string, unknown>));

    const { data: stateRows, error: stateError } = await client
      .from(STATE_TABLE)
      .select('version, updated_at')
      .limit(1);
    if (stateError) throw stateError;
    const state = stateRows?.find((row): row is TaxonomyStateRow => isStateRow(row as Record<string, unknown>));

    return {
      taxonomy: buildTaxonomyFromRows(rows),
      version: state?.version ?? activityTaxonomyVersion,
      fetchedAt: Date.now(),
    } satisfies TaxonomyFetchResult;
  } catch (error) {
    console.warn('[taxonomy] Falling back to bundled taxonomy', error);
    return {
      taxonomy: activityTaxonomy,
      version: activityTaxonomyVersion,
      fetchedAt: Date.now(),
    } satisfies TaxonomyFetchResult;
  }
}

const buildTaxonomyFromRows = (rows: TaxonomyFlatRow[]): ActivityTaxonomy => {
  const tier1Map = new Map<string, ActivityTier1Category>();
  const tier2Map = new Map<string, ActivityTier2Category>();

  rows.forEach((row) => {
    let tier1 = tier1Map.get(row.tier1_id);
    if (!tier1) {
      tier1 = {
        id: row.tier1_id,
        label: row.tier1_label,
        description: row.tier1_description,
        iconKey: row.tier1_icon_key,
        colorToken: row.tier1_color_token,
        tags: row.tier1_tags,
        children: [],
      };
      tier1Map.set(row.tier1_id, tier1);
    }

    let tier2 = tier2Map.get(row.tier2_id);
    if (!tier2) {
      tier2 = {
        id: row.tier2_id,
        label: row.tier2_label,
        description: row.tier2_description,
        iconKey: row.tier2_icon_key ?? undefined,
        tags: row.tier2_tags,
        children: [],
      };
      tier2Map.set(row.tier2_id, tier2);
      tier1.children.push(tier2);
    }

    const tier3: ActivityTier3Category = {
      id: row.tier3_id,
      label: row.tier3_label,
      description: row.tier3_description,
      iconKey: row.tier3_icon_key ?? undefined,
      tags: row.tier3_tags,
    };
    tier2.children.push(tier3);
  });

  return Array.from(tier1Map.values());
};
