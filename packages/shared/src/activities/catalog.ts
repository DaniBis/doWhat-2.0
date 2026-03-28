import { canonicalActivityDefinitions } from '../activityIntelligence/taxonomy';
import type { ActivityCatalogEntry } from './types';

export const ACTIVITY_CATALOG_PRESETS: ActivityCatalogEntry[] = canonicalActivityDefinitions
  .filter((entry): entry is typeof entry & { legacyCatalogId: number } => typeof entry.legacyCatalogId === 'number')
  .map((entry) => ({
    id: entry.legacyCatalogId,
    slug: entry.id,
    name: entry.displayLabel,
    description: `${entry.displayLabel} venues with explainable activity evidence.`,
    keywords: Array.from(new Set([entry.id, ...entry.aliases, ...entry.queryIntent.aliases])),
    fsq_categories: entry.preferredProviderCategories.foursquareCategoryIds ?? [],
  }))
  .sort((left, right) => left.id - right.id);

export const getActivityPresetById = (id: number): ActivityCatalogEntry | undefined =>
  ACTIVITY_CATALOG_PRESETS.find((entry) => entry.id === id);

export const getActivityPresetBySlug = (slug: string): ActivityCatalogEntry | undefined =>
  ACTIVITY_CATALOG_PRESETS.find((entry) => entry.slug === slug);
