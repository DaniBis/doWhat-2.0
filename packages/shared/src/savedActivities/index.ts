import { formatDateRange, formatPrice } from "../format";
import type { ActivityRow } from "../types";
import type { PlaceSummary } from "../places/types";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | null | undefined): value is string => Boolean(value && UUID_REGEX.test(value));

export type SavedPlace = {
  placeId: string;
  name: string | null;
  address: string | null;
  citySlug: string | null;
  venueId: string | null;
  sessionsCount: number;
  updatedAt: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SavePayload = {
  id: string;
  slug?: string | null;
  name?: string | null;
  address?: string | null;
  citySlug?: string | null;
  venueId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SavedSource = {
  table: string;
  select: string;
  userColumn?: string;
  writeTable: string;
};

export const READ_SOURCES: SavedSource[] = [
  {
    table: 'user_saved_activities_view',
    select:
      'user_id,place_id,place_name,place_address,city_slug,venue_id,venue_name,venue_address,sessions_count,metadata,updated_at',
    userColumn: 'user_id',
    writeTable: 'user_saved_activities',
  },
  {
    table: 'saved_activities_view',
    select: 'user_id,id,name,cover_url,sessions_count,updated_at',
    userColumn: 'user_id',
    writeTable: 'saved_activities',
  },
  {
    table: 'saved_activities',
    select: 'user_id,id,name,sessions_count,updated_at',
    userColumn: 'user_id',
    writeTable: 'saved_activities',
  },
];

export type WriteTarget = {
  table: string;
  buildInsert: (userId: string, payload: SavePayload) => Record<string, unknown>;
  buildDelete: (userId: string, placeId: string) => Record<string, unknown>;
  onConflict?: string;
};

export const cleanRecord = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

export const WRITE_TARGETS: WriteTarget[] = [
  {
    table: 'user_saved_activities',
    buildInsert: (userId, payload) => {
      const venueId = payload.venueId && isUuid(payload.venueId) ? payload.venueId : undefined;
      const derivedVenueId = !venueId && isUuid(payload.id) ? payload.id : undefined;
      return cleanRecord({
        user_id: userId,
        place_id: payload.id,
        venue_id: venueId ?? derivedVenueId,
        place_slug: payload.slug ?? undefined,
        place_name: payload.name ?? undefined,
        place_address: payload.address ?? undefined,
        city_slug: payload.citySlug ?? undefined,
        metadata: payload.metadata ?? undefined,
      });
    },
    buildDelete: (userId, placeId) => ({ user_id: userId, place_id: placeId }),
    onConflict: 'user_id,place_id',
  },
  {
    table: 'saved_activities',
    buildInsert: (userId, payload) => ({ user_id: userId, id: payload.id, name: payload.name ?? payload.id }),
    buildDelete: (userId, placeId) => ({ user_id: userId, id: placeId }),
    onConflict: 'user_id,id',
  },
];

export const firstTrimmedString = (candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const normaliseSavedActivityRow = (row: Record<string, unknown>): SavedPlace | null => {
  const candidateId = row.place_id ?? row.id ?? row.activity_id ?? null;
  if (!candidateId) return null;
  const placeId = String(candidateId);
  const sessionsRaw = row.sessions_count;
  const sessionsCount = typeof sessionsRaw === 'number' && Number.isFinite(sessionsRaw) ? sessionsRaw : 0;
  const venueId = typeof row.venue_id === 'string' && row.venue_id ? row.venue_id : null;
  const nameCandidates = [row.place_name, row.venue_name, row.name];
  const addressCandidates = [row.place_address, row.venue_address, row.address];
  const resolvedName = firstTrimmedString(nameCandidates);
  const resolvedAddress = firstTrimmedString(addressCandidates);
  const citySlug =
    (typeof row.city_slug === 'string' && row.city_slug) ||
    (typeof row.venue_city === 'string' && row.venue_city) ||
    null;
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null;
  const metadata = typeof row.metadata === 'object' && row.metadata !== null ? (row.metadata as Record<string, unknown>) : null;
  return {
    placeId,
    name: resolvedName,
    address: resolvedAddress,
    citySlug,
    venueId,
    sessionsCount,
    updatedAt,
    metadata,
  };
};

export const describeError = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
};

export const shouldFallback = (error: unknown): boolean => {
  if (!error) return false;
  const message = describeError(error);
  return /does not exist|relation .* not found|PGRST116/i.test(message);
};

const toMetadataRecord = (metadata: PlaceSummary["metadata"]): Record<string, unknown> | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
};

const normaliseStringId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const extractVenueIdFromPlace = (place: PlaceSummary | null | undefined): string | null => {
  if (!place) return null;
  const metadata = toMetadataRecord(place.metadata);
  if (!metadata) return null;
  const directKeys = [
    "linkedVenueId",
    "venueId",
    "venue_id",
    "supabaseVenueId",
    "supabase_venue_id",
    "matchedVenueId",
  ];
  for (const key of directKeys) {
    const maybe = normaliseStringId(metadata[key]);
    if (maybe && isUuid(maybe)) {
      return maybe;
    }
  }
  const nestedKeys: Array<{ key: string; path: string[] }> = [
    { key: "venue", path: ["id"] },
    { key: "supabaseVenue", path: ["id"] },
  ];
  for (const candidate of nestedKeys) {
    const nestedValue = metadata[candidate.key];
    if (!nestedValue || typeof nestedValue !== "object") continue;
    const nestedRecord = nestedValue as Record<string, unknown>;
    const maybe = normaliseStringId(nestedRecord[candidate.path[0]]);
    if (maybe && isUuid(maybe)) {
      return maybe;
    }
  }
  return null;
};

export const buildPlaceSavePayload = (place: PlaceSummary, fallbackCitySlug: string | null = null): SavePayload => {
  const venueId = extractVenueIdFromPlace(place);
  return {
    id: place.id,
    slug: place.slug ?? undefined,
    name: place.name ?? null,
    address: place.address ?? place.locality ?? place.city ?? null,
    citySlug: place.city ?? fallbackCitySlug ?? null,
    venueId: venueId ?? undefined,
    metadata: place.metadata ?? undefined,
  } satisfies SavePayload;
};

export type ActivitySummaryForSave = {
  id?: string | null;
  name?: string | null;
};

export const buildActivitySavePayload = (
  activity: ActivitySummaryForSave | null | undefined,
  rows: ActivityRow[],
  options?: { source?: string },
): SavePayload | null => {
  if (!activity) return null;
  const normalizedId = activity.id != null ? String(activity.id) : null;
  const normalizedName = activity.name?.trim() ?? null;
  const targetRow =
    rows.find((row) => {
      const rowActivityId = row.activities?.id != null ? String(row.activities.id) : null;
      if (normalizedId && rowActivityId === normalizedId) {
        return true;
      }
      if (!normalizedName) return false;
      const rowName = typeof row.activities?.name === "string" ? row.activities.name.trim().toLowerCase() : "";
      return rowName === normalizedName.toLowerCase();
    }) ?? null;

  if (!targetRow && !normalizedId && !normalizedName) {
    return null;
  }

  const activityId = normalizedId ?? (targetRow?.activities?.id != null ? String(targetRow.activities.id) : null) ?? normalizedName ?? null;
  if (!activityId) return null;

  const scheduleLabel = targetRow ? formatDateRange(targetRow.starts_at, targetRow.ends_at) : null;
  const priceLabel = targetRow ? formatPrice(targetRow.price_cents) : null;
  const resolvedName = normalizedName ?? targetRow?.activities?.name ?? activityId;
  const venueName = targetRow?.venues?.name ?? null;

  const metadata: Record<string, unknown> = {
    source: options?.source ?? "activity_card",
    fallbackMatch: !targetRow || undefined,
  };
  if (targetRow?.id) metadata.firstSessionId = targetRow.id;
  if (scheduleLabel) metadata.scheduleLabel = scheduleLabel;
  if (priceLabel) metadata.priceLabel = priceLabel;
  if (venueName) metadata.venueName = venueName;
  if (normalizedId && !targetRow) metadata.fallbackMatchId = normalizedId;
  if (normalizedName && !targetRow) metadata.fallbackMatchName = normalizedName;

  return {
    id: activityId,
    name: resolvedName,
    metadata,
  } satisfies SavePayload;
};

export const buildSessionSavePayload = (
  sessionRow: ActivityRow | null | undefined,
  options?: { source?: string },
): SavePayload | null => {
  if (!sessionRow) return null;
  const activityId = sessionRow.activities?.id ?? null;
  const fallbackId = typeof sessionRow.activities?.name === "string" ? sessionRow.activities.name : null;
  const targetId = activityId ?? fallbackId ?? sessionRow.id;
  if (!targetId) return null;
  const canonicalId = String(targetId);
  const name = sessionRow.activities?.name ?? fallbackId ?? canonicalId;
  const scheduleLabel = formatDateRange(sessionRow.starts_at, sessionRow.ends_at);
  const priceLabel = formatPrice(sessionRow.price_cents);
  const metadata: Record<string, unknown> = {
    source: options?.source ?? "session_card",
    sessionId: sessionRow.id ?? null,
  };
  if (activityId) metadata.activityId = activityId;
  if (scheduleLabel) metadata.scheduleLabel = scheduleLabel;
  if (priceLabel) metadata.priceLabel = priceLabel;
  if (sessionRow.venues?.name) metadata.venueName = sessionRow.venues.name;

  return {
    id: canonicalId,
    name,
    metadata,
  } satisfies SavePayload;
};
