import type { ActivityCatalogEntry } from './types';

export const ACTIVITY_CATALOG_PRESETS: ActivityCatalogEntry[] = [
  {
    id: 1,
    slug: 'chess',
    name: 'Chess',
    description: 'Quiet venues that host chess meetups, clubs, or lessons.',
    keywords: ['chess', 'board game', 'board games'],
    fsq_categories: ['4bf58dd8d48988d18d941735'],
  },
  {
    id: 2,
    slug: 'bowling',
    name: 'Bowling',
    description: 'Alleys and entertainment spaces with bowling lanes.',
    keywords: ['bowling', 'bowling alley', 'bowling lanes'],
    fsq_categories: ['4bf58dd8d48988d1e4931735'],
  },
  {
    id: 3,
    slug: 'climbing',
    name: 'Climbing & Bouldering',
    description: 'Indoor climbing gyms and bouldering studios.',
    keywords: ['climbing', 'rock climbing', 'bouldering'],
    fsq_categories: ['4bf58dd8d48988d1e1931735'],
  },
  {
    id: 4,
    slug: 'yoga',
    name: 'Yoga',
    description: 'Studios focused on yoga, stretching, or meditation.',
    keywords: ['yoga', 'meditation', 'stretching'],
    fsq_categories: ['4bf58dd8d48988d102941735'],
  },
];

export const getActivityPresetById = (id: number): ActivityCatalogEntry | undefined =>
  ACTIVITY_CATALOG_PRESETS.find((entry) => entry.id === id);

export const getActivityPresetBySlug = (slug: string): ActivityCatalogEntry | undefined =>
  ACTIVITY_CATALOG_PRESETS.find((entry) => entry.slug === slug);
