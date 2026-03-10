import { normaliseActivityName, type ActivityRow, type MapActivity } from '@dowhat/shared';

export type HomeNearbyActivity = {
  id: string;
  name: string;
  count: number;
  searchText: string;
};

export type HomeActivityEventCounts = {
  byActivityId: Map<string, number>;
  byActivityKey: Map<string, number>;
};

export type HomeActivityCardMeta = {
  eventCount: number;
  badgeLabel: string | null;
  supportingLabel: string;
};

const toFiniteNonNegativeInteger = (value: unknown): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
};

export const groupDiscoveryActivitiesForHome = (
  activities: readonly Pick<
    MapActivity,
    'name' | 'upcoming_session_count' | 'place_label' | 'activity_types' | 'taxonomy_categories' | 'tags'
  >[],
  buildSearchText: (parts: Array<string | null | undefined>) => string,
): HomeNearbyActivity[] => {
  const grouped = new Map<string, HomeNearbyActivity>();

  activities.forEach((activity) => {
    const name = typeof activity.name === 'string' ? activity.name.trim() : '';
    if (!name) return;

    const activityTypes = Array.isArray(activity.activity_types)
      ? activity.activity_types.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [];
    const taxonomyCategories = Array.isArray(activity.taxonomy_categories)
      ? activity.taxonomy_categories.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [];
    const tags = Array.isArray(activity.tags)
      ? activity.tags.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [];

    const searchText = buildSearchText([
      name,
      activity.place_label ?? undefined,
      ...activityTypes,
      ...taxonomyCategories,
      ...tags,
    ]);
    const key = normaliseActivityName(name);
    const count = toFiniteNonNegativeInteger(activity.upcoming_session_count);
    const existing = grouped.get(key);

    if (existing) {
      existing.count += count;
      existing.searchText = buildSearchText([existing.searchText, searchText]);
      return;
    }

    grouped.set(key, { id: key, name, count, searchText });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
};

export const buildHomeActivityEventCounts = (rows: readonly ActivityRow[]): HomeActivityEventCounts => {
  const byActivityId = new Map<string, number>();
  const byActivityKey = new Map<string, number>();

  rows.forEach((session) => {
    const activityId = session.activities?.id != null ? String(session.activities.id).trim() : '';
    if (activityId) {
      byActivityId.set(activityId, (byActivityId.get(activityId) ?? 0) + 1);
    }

    const activityName = typeof session.activities?.name === 'string' ? session.activities.name.trim() : '';
    const activityKey = activityName ? normaliseActivityName(activityName) : '';
    if (activityKey) {
      byActivityKey.set(activityKey, (byActivityKey.get(activityKey) ?? 0) + 1);
    }
  });

  return { byActivityId, byActivityKey };
};

export const resolveHomeActivityCardMeta = (
  activity: Pick<HomeNearbyActivity, 'id' | 'name' | 'count'>,
  counts: HomeActivityEventCounts,
): HomeActivityCardMeta => {
  const activityId = typeof activity.id === 'string' ? activity.id.trim() : '';
  const activityKey = typeof activity.name === 'string' ? normaliseActivityName(activity.name) : '';
  const exactCount = Math.max(
    activityId ? counts.byActivityId.get(activityId) ?? 0 : 0,
    activityKey ? counts.byActivityKey.get(activityKey) ?? 0 : 0,
    toFiniteNonNegativeInteger(activity.count),
  );

  if (exactCount <= 0) {
    return {
      eventCount: 0,
      badgeLabel: null,
      supportingLabel: 'Tap to view nearby places',
    };
  }

  return {
    eventCount: exactCount,
    badgeLabel: `${exactCount} upcoming event${exactCount === 1 ? '' : 's'}`,
    supportingLabel: 'Tap to view nearby places and times',
  };
};
