import type { MapActivity, PlaceSummary, SavePayload } from '@dowhat/shared';
import { buildPlaceSavePayload as buildSharedPlaceSavePayload } from '@dowhat/shared';

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

export function buildPlaceSavePayload(place: PlaceSummary | null | undefined): SavePayload | null {
  if (!place) return null;
  const payload = buildSharedPlaceSavePayload(place, place.city ?? null);
  const metadata = sanitizeMetadata({
    ...(payload.metadata ?? {}),
    source: 'places_map',
    categories: place.categories ?? null,
    tags: place.tags ?? null,
    slug: place.slug ?? null,
    lat: place.lat,
    lng: place.lng,
  });
  return {
    ...payload,
    metadata,
  } satisfies SavePayload;
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  return metadata;
}
