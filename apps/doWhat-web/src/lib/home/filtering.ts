import { normalizeCategoryKey } from '@/lib/places/categories';
import { haversineMeters } from '@/lib/places/utils';

export type HomeVenueRef = {
  id?: string | null;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type HomeSessionRow = {
  id: string;
  host_user_id?: string | null;
  price_cents?: number | null;
  reliability_score?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_id?: string | null;
  activities?:
    | {
        id?: string;
        name?: string | null;
        description?: string | null;
        activity_types?: string[] | null;
        tags?: string[] | null;
      }
    | Array<{
        id?: string;
        name?: string | null;
        description?: string | null;
        activity_types?: string[] | null;
        tags?: string[] | null;
      }>;
  venues?: HomeVenueRef | HomeVenueRef[] | null;
};

export type HomeActivityCardGroup = {
  activity: {
    id?: string;
    name?: string | null;
    description?: string | null;
    activity_types?: string[] | null;
    tags?: string[] | null;
  };
  sessions: Array<{
    id?: string;
    host_user_id?: string | null;
    price_cents?: number | null;
    reliability_score?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    venue_id?: string | null;
    venues?: HomeVenueRef | HomeVenueRef[] | null;
  }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  activity: 'Activities',
  arts_culture: 'Arts & Culture',
  coffee: 'Coffee',
  community: 'Social',
  education: 'Learning',
  event_space: 'Entertainment',
  fitness: 'Fitness',
  food: 'Food & Drink',
  kids: 'Kids',
  nightlife: 'Nightlife',
  outdoors: 'Outdoor',
  shopping: 'Shopping',
  spiritual: 'Spiritual',
  wellness: 'Wellness',
  workspace: 'Workspace',
};

const toArray = (input: unknown): string[] => {
  if (Array.isArray(input)) return input.filter((value): value is string => typeof value === 'string');
  if (typeof input === 'string') return [input];
  return [];
};

export const normalizeCategoryId = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = normalizeCategoryKey(value);
  if (normalized) return normalized;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/[\s]+/g, '_');
};

export const friendlyCategoryLabel = (category: string): string => {
  const label = CATEGORY_LABELS[category];
  if (label) return label;
  const spaced = category.replace(/[_-]+/g, ' ');
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
};

const gatherCategorySignals = (values: unknown): { canonical: Set<string>; display: Set<string> } => {
  const canonical = new Set<string>();
  const display = new Set<string>();
  toArray(values).forEach((entry) => {
    const id = normalizeCategoryId(entry);
    if (id) {
      canonical.add(id);
      display.add(friendlyCategoryLabel(id));
    } else if (typeof entry === 'string' && entry.trim()) {
      display.add(entry.trim());
    }
  });
  return { canonical, display };
};

const analyseActivityCategories = (
  activity: {
    name?: string | null;
    activity_types?: unknown;
    tags?: unknown;
  },
  filters: string[],
) => {
  const fromTypes = gatherCategorySignals(activity.activity_types);
  const fromTags = gatherCategorySignals(activity.tags);
  const canonical = new Set<string>([...fromTypes.canonical, ...fromTags.canonical]);
  const display = new Set<string>([...fromTypes.display, ...fromTags.display]);
  const matchedFilters = new Set<string>();

  const name = activity.name?.toLowerCase() ?? '';
  filters.forEach((filter) => {
    if (canonical.has(filter)) {
      matchedFilters.add(filter);
      return;
    }
    const candidateTerms = new Set<string>([
      filter.replace(/_/g, ' '),
      friendlyCategoryLabel(filter).toLowerCase(),
    ]);
    const hasTermInName = Array.from(candidateTerms).some((term) => term && name.includes(term));
    if (hasTermInName) {
      matchedFilters.add(filter);
    }
  });

  matchedFilters.forEach((filter) => {
    canonical.add(filter);
    display.add(friendlyCategoryLabel(filter));
  });

  const matches = filters.length === 0 || matchedFilters.size > 0;

  return { matches, canonical, display };
};

export const buildHomeCards = (input: {
  rows: HomeSessionRow[];
  userId: string;
  searchQuery: string;
  normalizedFilterTypes: string[];
  minReliability: number;
  hostSelfOnly: boolean;
  userLat: number | null;
  userLng: number | null;
  radiusKm: number;
  limit?: number;
}): HomeActivityCardGroup[] => {
  const grouped = new Map<string, {
    activity: {
      id?: string;
      name?: string | null;
      description?: string | null;
      activity_types?: string[] | null;
      tags?: string[] | null;
    };
    canonicalCategories: Set<string>;
    displayCategories: Set<string>;
    sessions: Array<{
      id?: string;
      host_user_id?: string | null;
      price_cents?: number | null;
      reliability_score?: number | null;
      starts_at?: string | null;
      ends_at?: string | null;
      venue_id?: string | null;
      venues?: HomeVenueRef | HomeVenueRef[] | null;
    }>;
  }>();

  const radiusMeters = input.radiusKm * 1000;

  for (const session of input.rows) {
    const activityRel = Array.isArray(session.activities)
      ? session.activities[0]
      : session.activities;
    if (!activityRel) continue;

    const venueRel = Array.isArray(session.venues)
      ? session.venues[0]
      : session.venues;

    if (input.hostSelfOnly && session.host_user_id !== input.userId) {
      continue;
    }

    const reliabilityScore = typeof session.reliability_score === 'number' ? session.reliability_score : null;
    if (input.minReliability > 0 && (reliabilityScore == null || reliabilityScore < input.minReliability)) {
      continue;
    }

    if (input.userLat != null && input.userLng != null) {
      const venueLat = typeof venueRel?.lat === 'number' ? venueRel.lat : null;
      const venueLng = typeof venueRel?.lng === 'number' ? venueRel.lng : null;
      if (venueLat == null || venueLng == null) {
        continue;
      }
      const distance = haversineMeters(input.userLat, input.userLng, venueLat, venueLng);
      if (distance > radiusMeters) {
        continue;
      }
    }

    if (input.searchQuery) {
      const haystack = [
        activityRel.name,
        activityRel.description,
        venueRel?.name,
        ...(activityRel.activity_types ?? []),
        ...(activityRel.tags ?? []),
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(input.searchQuery)) {
        continue;
      }
    }

    const analysis = analyseActivityCategories(
      {
        name: activityRel.name,
        activity_types: activityRel.activity_types,
        tags: activityRel.tags,
      },
      input.normalizedFilterTypes,
    );

    if (!analysis.matches) continue;

    const key = activityRel.id ?? activityRel.name ?? session.id;
    if (!grouped.has(key)) {
      const activityTags = toArray(activityRel.tags);
      grouped.set(key, {
        activity: {
          id: activityRel.id ?? undefined,
          name: activityRel.name ?? null,
          description: activityRel.description ?? null,
          activity_types: null,
          tags: activityTags.length ? activityTags : null,
        },
        canonicalCategories: new Set<string>(),
        displayCategories: new Set<string>(),
        sessions: [],
      });
    }

    const bucket = grouped.get(key);
    if (!bucket) continue;

    analysis.canonical.forEach((category) => bucket.canonicalCategories.add(category));
    analysis.display.forEach((label) => bucket.displayCategories.add(label));

    bucket.sessions.push({
      id: session.id,
      host_user_id: session.host_user_id ?? null,
      price_cents: session.price_cents ?? null,
      reliability_score: reliabilityScore,
      starts_at: session.starts_at ?? null,
      ends_at: session.ends_at ?? null,
      venue_id: session.venue_id ?? null,
      venues: session.venues ?? null,
    });
  }

  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;

  return Array.from(grouped.values())
    .map((group) => {
      const activityTypes = group.displayCategories.size
        ? Array.from(group.displayCategories).sort((a, b) => a.localeCompare(b))
        : null;
      const firstStart = group.sessions.reduce((min, session) => {
        if (!session.starts_at) return min;
        const time = new Date(session.starts_at).getTime();
        return min == null || time < min ? time : min;
      }, null as number | null);

      return {
        activity: {
          ...group.activity,
          activity_types: activityTypes,
        },
        sessions: group.sessions,
        firstStart,
      };
    })
    .sort((a, b) => {
      if (a.firstStart == null && b.firstStart == null) return 0;
      if (a.firstStart == null) return 1;
      if (b.firstStart == null) return -1;
      return a.firstStart - b.firstStart;
    })
    .slice(0, limit)
    .map((entry) => {
      const { firstStart, ...rest } = entry;
      void firstStart;
      return rest;
    });
};
