import type { MapActivity, SavePayload } from '@dowhat/shared';

export function buildMapActivitySavePayload(activity: MapActivity | null | undefined): SavePayload | null {
  if (!activity?.id) return null;
  return {
    id: activity.id,
    name: activity.name ?? null,
    address: activity.venue ?? undefined,
    metadata: {
      source: 'web_map',
      venue: activity.venue ?? null,
      activityTypes: activity.activity_types ?? null,
      tags: activity.tags ?? null,
      traits: activity.traits ?? null,
      distanceMeters: activity.distance_m ?? null,
    },
  } satisfies SavePayload;
}
