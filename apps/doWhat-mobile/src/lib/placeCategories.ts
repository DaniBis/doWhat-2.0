import type { PlaceSummary } from '@dowhat/shared';

export type CategoryAppearance = {
  emoji: string;
  color: string;
};

const CATEGORY_APPEARANCES: Record<string, CategoryAppearance> = {
  venue: { emoji: '📍', color: '#0EA5E9' },
  cafe: { emoji: '☕', color: '#F59E0B' },
  coworking: { emoji: '💼', color: '#6366F1' },
  outdoor: { emoji: '🌳', color: '#22C55E' },
  park: { emoji: '🌿', color: '#16A34A' },
  food: { emoji: '🍽️', color: '#EF4444' },
  restaurant: { emoji: '🍽️', color: '#EF4444' },
  bar: { emoji: '🍸', color: '#8B5CF6' },
  activity: { emoji: '🎯', color: '#F97316' },
  community: { emoji: '🤝', color: '#38BDF8' },
  education: { emoji: '📚', color: '#6366F1' },
  event_space: { emoji: '🎟️', color: '#8B5CF6' },
  kids: { emoji: '🧒', color: '#F472B6' },
  shopping: { emoji: '🛍️', color: '#FB7185' },
  spiritual: { emoji: '🙏', color: '#A855F7' },
  wellness: { emoji: '🧘', color: '#34D399' },
  badminton: { emoji: '🏸', color: '#16A34A' },
  chess: { emoji: '♟️', color: '#1E293B' },
  art_gallery: { emoji: '🖼️', color: '#F59E0B' },
  board_games: { emoji: '🎲', color: '#6366F1' },
  yoga: { emoji: '🧘', color: '#22C55E' },
  rock_climbing: { emoji: '🧗', color: '#F97316' },
  running_parks: { emoji: '🏃', color: '#0EA5E9' },
};

export const DEFAULT_CATEGORY_APPEARANCE: CategoryAppearance = { emoji: '📍', color: '#10B981' };

export const capitaliseWords = (value: string) => value.replace(/\b([a-z])/g, (match) => match.toUpperCase());

export const formatCategoryLabel = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return capitaliseWords(words);
};

export const normaliseCategoryKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

export const resolvePrimaryCategoryKey = (place: PlaceSummary, preferred?: string[]): string | null => {
  const preferenceSet = new Set((preferred ?? []).map((value) => normaliseCategoryKey(value)));
  const candidates = [...(place.categories ?? []), ...(place.tags ?? [])];
  for (const raw of candidates) {
    const key = normaliseCategoryKey(raw);
    if (!key) continue;
    if (preferenceSet.size && preferenceSet.has(key)) {
      return key;
    }
    if (CATEGORY_APPEARANCES[key]) {
      return key;
    }
  }
  if (place.primarySource) {
    const sourceKey = normaliseCategoryKey(String(place.primarySource));
    if (sourceKey && CATEGORY_APPEARANCES[sourceKey]) {
      return sourceKey;
    }
  }
  return null;
};

export const resolveCategoryAppearance = (place: PlaceSummary, preferred?: string[]) => {
  const key = resolvePrimaryCategoryKey(place, preferred);
  if (key && CATEGORY_APPEARANCES[key]) {
    return CATEGORY_APPEARANCES[key];
  }
  return DEFAULT_CATEGORY_APPEARANCE;
};
