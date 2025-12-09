import type { RankedVenueActivity } from '@/lib/venues/types';

export type BuildCreateEventQueryOptions = {
  categoryIds?: string[];
  source?: string;
};

export function buildCreateEventQuery(
  venue: RankedVenueActivity,
  activityLabel: string,
  options?: BuildCreateEventQueryOptions,
) {
  const query: Record<string, string> = {
    venueId: venue.venueId,
    venueName: venue.venueName,
    activityName: activityLabel,
    source: options?.source ?? 'venue_verification',
  };

  if (typeof venue.lat === 'number' && Number.isFinite(venue.lat)) {
    query.lat = venue.lat.toFixed(6);
  }
  if (typeof venue.lng === 'number' && Number.isFinite(venue.lng)) {
    query.lng = venue.lng.toFixed(6);
  }
  if (venue.displayAddress) {
    query.venueAddress = venue.displayAddress;
  }

  const categoryIds = normaliseCategoryIds(options?.categoryIds);
  if (categoryIds.length) {
    query.categoryId = categoryIds[0];
    query.categoryIds = categoryIds.join(',');
  }

  return query;
}

export function buildPrefillContextSummary(
  venue: RankedVenueActivity | null,
  activityLabel: string,
  categoryDescription: string,
) {
  if (!venue) return activityLabel;
  const parts = [activityLabel];
  if (categoryDescription && categoryDescription !== 'All supported activities') {
    parts.push(categoryDescription);
  }
  if (typeof venue.lat === 'number' && typeof venue.lng === 'number') {
    parts.push(`${venue.lat.toFixed(4)}, ${venue.lng.toFixed(4)}`);
  }
  return parts.join(' • ');
}

export function normaliseCategoryIds(ids?: string[]) {
  if (!ids?.length) return [] as string[];
  const seen = new Set<string>();
  const result: string[] = [];
  ids.forEach((id) => {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

type MaybeString = string | null | undefined;

export type SessionCloneSource = {
  activityId?: MaybeString;
  activityName?: MaybeString;
  activityTypes?: Array<MaybeString> | null;
  venueId?: MaybeString;
  venueName?: MaybeString;
  venueAddress?: MaybeString;
  venueLat?: number | null;
  venueLng?: number | null;
  priceCents?: number | null;
  startsAt?: MaybeString;
  endsAt?: MaybeString;
};

const trim = (value?: MaybeString) => (typeof value === 'string' ? value.trim() : '');

export function buildSessionCloneQuery(source: SessionCloneSource, options?: { source?: string }) {
  const query: Record<string, string> = {
    source: options?.source ?? 'admin_dashboard_session',
  };

  const activityId = trim(source.activityId);
  if (activityId) query.activityId = activityId;

  const activityName = trim(source.activityName);
  if (activityName) query.activityName = activityName;

  const venueId = trim(source.venueId);
  if (venueId) query.venueId = venueId;

  const venueName = trim(source.venueName);
  if (venueName) query.venueName = venueName;

  const venueAddress = trim(source.venueAddress);
  if (venueAddress) query.venueAddress = venueAddress;

  if (typeof source.venueLat === 'number' && Number.isFinite(source.venueLat)) {
    query.lat = source.venueLat.toFixed(6);
  }
  if (typeof source.venueLng === 'number' && Number.isFinite(source.venueLng)) {
    query.lng = source.venueLng.toFixed(6);
  }

  const categoryIds = normaliseCategoryIds(
    Array.isArray(source.activityTypes)
      ? (source.activityTypes.filter((value): value is string => typeof value === 'string') as string[])
      : undefined,
  );
  if (categoryIds.length) {
    query.categoryId = categoryIds[0];
    query.categoryIds = categoryIds.join(',');
  }

  if (typeof source.priceCents === 'number' && Number.isFinite(source.priceCents) && source.priceCents > 0) {
    const dollars = source.priceCents / 100;
    query.price = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  }

  const startsAt = trim(source.startsAt);
  if (startsAt) query.startsAt = startsAt;

  const endsAt = trim(source.endsAt);
  if (endsAt) query.endsAt = endsAt;

  return query;
}
