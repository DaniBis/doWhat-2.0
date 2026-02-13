import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isUuid } from '@dowhat/shared';
import { hydratePlaceLabel } from '@/lib/places/labels';
import { resolvePlaceFromCoordsWithClient } from '@/lib/places/resolver';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isMissingColumnError } from '@/lib/supabase/errors';
import type { ProfileRow, SessionAttendeeRow, SessionRow } from '@/types/database';

export type SessionVisibility = SessionRow['visibility'];

export type ActivitySummary = {
  id: string;
  name: string | null;
  description: string | null;
  venueLabel: string | null;
  lat: number | null;
  lng: number | null;
};

export type VenueSummary = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type PlaceSummary = {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  categories: string[] | null;
  kind: string | null;
};

export type ProfileSummary = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type HydratedSession = {
  id: string;
  activityId: string | null;
  venueId: string | null;
  placeId: string | null;
  hostUserId: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  price: number;
  maxAttendees: number;
  visibility: SessionVisibility;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  placeLabel: string | null;
  place: PlaceSummary | null;
  reliabilityScore: number | null;
  activity: ActivitySummary | null;
  venue: VenueSummary | null;
  host: ProfileSummary | null;
};

export function resolveSessionTitle(session: HydratedSession): string {
  const candidates = [
    session.activity?.name,
    session.description,
    session.venue?.name,
    session.placeLabel,
    session.activity?.venueLabel,
  ];

  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return 'Community session';
}

export type AttendanceCounts = {
  going: number;
  interested: number;
  declined: number;
  total: number;
  verified: number;
};

export type ParsedSessionPayload = {
  activityId?: string | null;
  activityName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  lat?: number | null;
  lng?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  priceCents?: number | null;
  maxAttendees?: number | null;
  visibility?: SessionVisibility;
  description?: string | null;
};

export type SessionPayloadOptions = {
  requireSchedule?: boolean;
  requireCoordinates?: boolean;
  defaultVisibility?: SessionVisibility;
  defaultMaxAttendees?: number;
  defaultPriceCents?: number;
};

type ActivityPlaceColumnState = 'unknown' | 'available' | 'missing';
let activitiesPlaceColumnSupport: ActivityPlaceColumnState = 'unknown';
let loggedMissingActivitiesPlaceColumnWarning = false;

const canUseActivitiesPlaceColumn = () => activitiesPlaceColumnSupport !== 'missing';
const markActivitiesPlaceColumnAvailable = () => {
  if (activitiesPlaceColumnSupport === 'unknown') {
    activitiesPlaceColumnSupport = 'available';
  }
};
const markActivitiesPlaceColumnMissing = () => {
  if (activitiesPlaceColumnSupport === 'missing') return;
  activitiesPlaceColumnSupport = 'missing';
  if (!loggedMissingActivitiesPlaceColumnWarning) {
    loggedMissingActivitiesPlaceColumnWarning = true;
    if (process.env.NODE_ENV !== 'test') {
      console.warn('activities.place_id column missing; rerun migrations 045+ to restore canonical place linkage.');
    }
  }
};


type ActivityPlaceLabelColumnState = 'unknown' | 'available' | 'missing';
let activitiesPlaceLabelColumnSupport: ActivityPlaceLabelColumnState = 'unknown';
let loggedMissingActivitiesPlaceLabelWarning = false;

const canUseActivitiesPlaceLabelColumn = () => activitiesPlaceLabelColumnSupport !== 'missing';
const markActivitiesPlaceLabelColumnAvailable = () => {
  if (activitiesPlaceLabelColumnSupport === 'unknown') {
    activitiesPlaceLabelColumnSupport = 'available';
  }
};
const markActivitiesPlaceLabelColumnMissing = () => {
  if (activitiesPlaceLabelColumnSupport === 'missing') return;
  activitiesPlaceLabelColumnSupport = 'missing';
  if (!loggedMissingActivitiesPlaceLabelWarning) {
    loggedMissingActivitiesPlaceLabelWarning = true;
    if (process.env.NODE_ENV !== 'test') {
      console.warn('activities.place_label column missing; rerun migrations 048+ to restore canonical place labels.');
    }
  }
};

const SESSION_PLACE_LABEL_FALLBACK = 'Unknown location';

const trimLabel = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
};

const loadPlaceName = async (service: SupabaseClient, placeId?: string | null): Promise<string> => {
  if (!placeId) return '';
  const { data, error } = await service
    .from('places')
    .select('name')
    .eq('id', placeId)
    .maybeSingle<{ name: string | null }>();
  if (error) {
    return '';
  }
  return trimLabel(data?.name ?? null);
};

const loadActivityPlaceLabel = async (
  service: SupabaseClient,
  activityId?: string | null,
): Promise<string> => {
  const candidateId = isUuid(activityId ?? null) ? activityId : null;
  if (!candidateId) return '';
  const { data, error } = await service
    .from('activities')
    .select('place_label')
    .eq('id', candidateId)
    .maybeSingle<{ place_label?: string | null }>();
  if (error) {
    return '';
  }
  return trimLabel(data?.place_label ?? null);
};

export const deriveSessionPlaceLabel = async (
  service: SupabaseClient,
  input: {
    placeId?: string | null;
    activityId?: string | null;
    venueName?: string | null;
  },
): Promise<string> => {
  const placeLabel = await loadPlaceName(service, input.placeId ?? null);
  if (placeLabel) return placeLabel;

  const activityLabel = await loadActivityPlaceLabel(service, input.activityId ?? null);
  if (activityLabel) return activityLabel;

  const venueLabel = trimLabel(input.venueName ?? null);
  if (venueLabel) return venueLabel;

  return SESSION_PLACE_LABEL_FALLBACK;
};

export class SessionValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SessionValidationError';
    this.statusCode = statusCode;
  }
}

export async function resolveApiUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const service = createServiceClient();

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const { data, error } = await service.auth.getUser(token);
        if (!error && data?.user) return data.user;
      } catch {
        // Ignore bearer parsing errors and fall back to cookie session.
      }
    }
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export function extractSessionPayload(body: unknown, options: SessionPayloadOptions = {}): ParsedSessionPayload {
  if (!body || typeof body !== 'object') {
    throw new SessionValidationError('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  const parsed: ParsedSessionPayload = {};

  assignOptionalId(raw, 'activityId', (value) => {
    parsed.activityId = value;
  });
  assignOptionalId(raw, 'activity_id', (value) => {
    parsed.activityId = value;
  });
  assignOptionalText(raw, 'activityName', (value) => {
    parsed.activityName = value;
  });
  assignOptionalText(raw, 'activity_name', (value) => {
    parsed.activityName = value;
  });

  assignOptionalId(raw, 'venueId', (value) => {
    parsed.venueId = value;
  });
  assignOptionalId(raw, 'venue_id', (value) => {
    parsed.venueId = value;
  });
  assignOptionalText(raw, 'venueName', (value) => {
    parsed.venueName = value;
  });
  assignOptionalText(raw, 'venue_name', (value) => {
    parsed.venueName = value;
  });

  const latProvided = hasKey(raw, 'lat');
  const lngProvided = hasKey(raw, 'lng');
  if (latProvided) parsed.lat = parseCoordinate(raw.lat, 'latitude');
  if (lngProvided) parsed.lng = parseCoordinate(raw.lng, 'longitude');

  if (options.requireCoordinates) {
    if (parsed.lat == null || parsed.lng == null) {
      throw new SessionValidationError('Latitude and longitude are required.');
    }
  }

  const startProvided = hasKey(raw, 'startsAt') || hasKey(raw, 'starts_at');
  const endProvided = hasKey(raw, 'endsAt') || hasKey(raw, 'ends_at');
  if (startProvided) parsed.startsAt = parseIsoDate(raw.startsAt ?? raw.starts_at, 'start time');
  if (endProvided) parsed.endsAt = parseIsoDate(raw.endsAt ?? raw.ends_at, 'end time');

  if (options.requireSchedule) {
    if (!parsed.startsAt || !parsed.endsAt) {
      throw new SessionValidationError('Start and end times are required.');
    }
    ensureChronology(parsed.startsAt, parsed.endsAt);
  } else if (parsed.startsAt && parsed.endsAt) {
    ensureChronology(parsed.startsAt, parsed.endsAt);
  }

  const priceCents = resolvePriceCents(raw);
  if (priceCents != null) {
    parsed.priceCents = priceCents;
  } else if (options.defaultPriceCents != null) {
    parsed.priceCents = options.defaultPriceCents;
  }

  const maxAttendees = resolveMaxAttendees(raw);
  if (maxAttendees != null) {
    parsed.maxAttendees = maxAttendees;
  } else if (options.defaultMaxAttendees != null) {
    parsed.maxAttendees = options.defaultMaxAttendees;
  }

  const visibility = resolveVisibility(raw, options.defaultVisibility);
  if (visibility) parsed.visibility = visibility;

  if (hasKey(raw, 'description')) {
    parsed.description = sanitizeText(raw.description);
  }

  return parsed;
}

type PlaceLabelRow = { name: string | null };

const resolveActivityPlaceLabel = async (
  service: SupabaseClient,
  input: {
    placeId?: string | null;
    venueName?: string | null;
    fallbackLabel?: string | null;
  },
): Promise<string> => {
  let place: { name?: string | null } | null = null;
  if (input.placeId) {
    const { data, error } = await service
      .from('places')
      .select('name')
      .eq('id', input.placeId)
      .maybeSingle<PlaceLabelRow>();
    if (!error && data?.name) {
      place = { name: data.name };
    }
  }
  return hydratePlaceLabel({
    place,
    venue: input.venueName ?? null,
    fallbackLabel: input.fallbackLabel ?? null,
  });
};

export async function ensureActivity(service: SupabaseClient, input: {
  activityId?: string | null;
  activityName?: string | null;
  lat?: number | null;
  lng?: number | null;
  venueName?: string | null;
  placeId?: string | null;
}): Promise<string> {
  const candidateId = isUuid(input.activityId ?? null) ? input.activityId : null;
  if (candidateId) return candidateId;
  const activityName = sanitizeRequiredText(input.activityName, 'Activity name is required.');

  const includePlaceColumn = canUseActivitiesPlaceColumn();
  const includePlaceLabelColumn = canUseActivitiesPlaceLabelColumn();
  const selectColumns = ['id'];
  if (includePlaceColumn) selectColumns.push('place_id');
  if (includePlaceLabelColumn) selectColumns.push('place_label');

  const { data: existing, error: fetchError } = await service
    .from('activities')
    .select(selectColumns.join(', '))
    .eq('name', activityName)
    .maybeSingle<{ id: string; place_id?: string | null; place_label?: string | null }>();
  if (fetchError) {
    if (includePlaceColumn && isMissingColumnError(fetchError, 'place_id')) {
      markActivitiesPlaceColumnMissing();
      return ensureActivity(service, input);
    }
    if (includePlaceLabelColumn && isMissingColumnError(fetchError, 'place_label')) {
      markActivitiesPlaceLabelColumnMissing();
      return ensureActivity(service, input);
    }
    throw fetchError;
  }
  if (includePlaceColumn) {
    markActivitiesPlaceColumnAvailable();
  }
  if (includePlaceLabelColumn) {
    markActivitiesPlaceLabelColumnAvailable();
  }
  if (existing?.id) {
    const updates: Record<string, unknown> = {};
    const nextPlaceId = input.placeId ?? existing.place_id ?? null;
    if (includePlaceColumn && !existing.place_id && input.placeId) {
      updates.place_id = input.placeId;
    }
    if (includePlaceLabelColumn) {
      const existingLabel = existing.place_label ?? null;
      const labelMissing = !existingLabel || !existingLabel.trim();
      const shouldUpdateLabel = labelMissing || Boolean(updates.place_id);
      if (shouldUpdateLabel) {
        const placeLabel = await resolveActivityPlaceLabel(service, {
          placeId: (updates.place_id as string | null | undefined) ?? nextPlaceId,
          venueName: input.venueName ?? null,
          fallbackLabel: activityName,
        });
        updates.place_label = placeLabel;
      }
    }
    if (Object.keys(updates).length) {
      await service.from('activities').update(updates).eq('id', existing.id);
    }
    return existing.id;
  }

  const insert: Record<string, unknown> = { name: activityName };
  if (typeof input.lat === 'number') insert.lat = input.lat;
  if (typeof input.lng === 'number') insert.lng = input.lng;
  if (input.venueName) insert.venue = input.venueName;
  if (includePlaceColumn && input.placeId) insert.place_id = input.placeId;
  if (includePlaceLabelColumn) {
    const placeLabel = await resolveActivityPlaceLabel(service, {
      placeId: input.placeId ?? null,
      venueName: input.venueName ?? null,
      fallbackLabel: activityName,
    });
    insert.place_label = placeLabel;
  }

  const { data: inserted, error: insertError } = await service
    .from('activities')
    .insert(insert)
    .select('id')
    .single<{ id: string }>();
  if (insertError) throw insertError;
  return inserted.id;
}

export async function ensureVenue(service: SupabaseClient, input: {
  venueId?: string | null;
  venueName?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<string> {
  const candidateId = isUuid(input.venueId ?? null) ? input.venueId : null;
  if (candidateId) return candidateId;
  const venueName = sanitizeRequiredText(input.venueName, 'Venue name is required.');

  const { data: existing, error: fetchError } = await service
    .from('venues')
    .select('id, lat, lng')
    .eq('name', venueName)
    .maybeSingle<{ id: string; lat?: number | null; lng?: number | null }>();
  if (fetchError) throw fetchError;
  if (existing?.id) {
    const needsLat = existing.lat == null && typeof input.lat === 'number';
    const needsLng = existing.lng == null && typeof input.lng === 'number';
    if (needsLat || needsLng) {
      const patch: Record<string, unknown> = {};
      if (needsLat) patch.lat = input.lat;
      if (needsLng) patch.lng = input.lng;
      if (Object.keys(patch).length) {
        await service.from('venues').update(patch).eq('id', existing.id);
      }
    }
    return existing.id;
  }

  if (typeof input.lat !== 'number' || typeof input.lng !== 'number') {
    throw new SessionValidationError('Latitude and longitude are required to create a new venue.');
  }

  const insert = {
    name: venueName,
    lat: input.lat,
    lng: input.lng,
  };
  const { data: inserted, error: insertError } = await service
    .from('venues')
    .insert(insert)
    .select('id')
    .single<{ id: string }>();
  if (insertError) throw insertError;
  return inserted.id;
}

export async function resolveSessionPlaceId(
  service: SupabaseClient,
  input: {
    activityId?: string | null;
    lat?: number | null;
    lng?: number | null;
    labelHint?: string | null;
  },
): Promise<string | null> {
  const activityId = isUuid(input.activityId ?? null) ? input.activityId : null;
  let activityPlaceId: string | null = null;

  if (activityId && canUseActivitiesPlaceColumn()) {
    const { data, error } = await service
      .from('activities')
      .select('id, place_id')
      .eq('id', activityId)
      .maybeSingle<{ id: string; place_id?: string | null; place_label?: string | null }>();
    if (error) {
      if (isMissingColumnError(error, 'place_id')) {
        markActivitiesPlaceColumnMissing();
      } else {
        throw error;
      }
    } else {
      markActivitiesPlaceColumnAvailable();
      activityPlaceId = data?.place_id ?? null;
    }
  }

  if (activityPlaceId) return activityPlaceId;

  const hasCoords = typeof input.lat === 'number' && Number.isFinite(input.lat)
    && typeof input.lng === 'number' && Number.isFinite(input.lng);
  if (!hasCoords) return null;

  const resolvedPlace = await resolvePlaceFromCoordsWithClient(service, {
    lat: input.lat!,
    lng: input.lng!,
    labelHint: input.labelHint ?? null,
    source: 'session-api',
  });

  if (activityId && canUseActivitiesPlaceColumn()) {
    const updates: Record<string, unknown> = { place_id: resolvedPlace.placeId };
    if (canUseActivitiesPlaceLabelColumn()) {
      const placeLabel = await resolveActivityPlaceLabel(service, {
        placeId: resolvedPlace.placeId,
        venueName: input.labelHint ?? null,
        fallbackLabel: input.labelHint ?? null,
      });
      updates.place_label = placeLabel;
    }
    const { error: updateError } = await service
      .from('activities')
      .update(updates)
      .eq('id', activityId);
    if (updateError) {
      if (isMissingColumnError(updateError, 'place_label')) {
        markActivitiesPlaceLabelColumnMissing();
        const { error: retryError } = await service
          .from('activities')
          .update({ place_id: resolvedPlace.placeId })
          .eq('id', activityId);
        if (retryError && !isMissingColumnError(retryError, 'place_id')) {
          throw retryError;
        }
      } else if (isMissingColumnError(updateError, 'place_id')) {
        markActivitiesPlaceColumnMissing();
      } else {
        throw updateError;
      }
    }
  }

  return resolvedPlace.placeId ?? null;
}

export async function hydrateSessions(service: SupabaseClient, rows: SessionRow[]): Promise<HydratedSession[]> {
  if (!rows.length) return [];

  const activityIds = dedupe(rows.map((row) => row.activity_id).filter(Boolean) as string[]);
  const venueIds = dedupe(rows.map((row) => row.venue_id).filter(Boolean) as string[]);
  const hostIds = dedupe(rows.map((row) => row.host_user_id));
  const placeIds = dedupe(rows.map((row) => row.place_id).filter(Boolean) as string[]);

  const [activityMap, venueMap, profileMap, placeMap] = await Promise.all([
    loadActivities(service, activityIds),
    loadVenues(service, venueIds),
    loadProfiles(service, hostIds),
    loadPlaces(service, placeIds),
  ]);

  return rows.map((row) => {
    const activity = row.activity_id ? activityMap.get(row.activity_id) ?? null : null;
    const venue = row.venue_id ? venueMap.get(row.venue_id) ?? null : null;
    const placeId = typeof row.place_id === 'string' ? row.place_id : null;
    const place = placeId ? placeMap.get(placeId) ?? null : null;
    const placeLabel = hydratePlaceLabel({
      place,
      venue: venue?.name ?? activity?.venueLabel ?? null,
      address: venue?.address ?? null,
      fallbackLabel: activity?.name ?? null,
    });

    return {
      id: row.id,
      activityId: row.activity_id,
      venueId: row.venue_id,
      placeId,
      hostUserId: row.host_user_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      priceCents: row.price_cents ?? 0,
      price: (row.price_cents ?? 0) / 100,
      maxAttendees: row.max_attendees,
      visibility: row.visibility,
      description: row.description ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      placeLabel,
      place,
      reliabilityScore: normalizeReliabilityScore(row.reliability_score),
      activity,
      venue,
      host: profileMap.get(row.host_user_id) ?? null,
    } satisfies HydratedSession;
  });
}

export const __sessionServerTesting = {
  resetActivitiesPlaceColumnDetection() {
    activitiesPlaceColumnSupport = 'unknown';
    loggedMissingActivitiesPlaceColumnWarning = false;
    activitiesPlaceLabelColumnSupport = 'unknown';
    loggedMissingActivitiesPlaceLabelWarning = false;
  },
};

function hasKey(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function assignOptionalId(
  raw: Record<string, unknown>,
  key: string,
  assign: (value: string | null) => void,
) {
  if (!hasKey(raw, key)) return;
  const value = raw[key];
  if (value == null) {
    assign(null);
    return;
  }
  if (typeof value !== 'string') {
    throw new SessionValidationError(`Field ${key} must be a string.`);
  }
  const trimmed = value.trim();
  assign(trimmed || null);
}

function assignOptionalText(
  raw: Record<string, unknown>,
  key: string,
  assign: (value: string | null) => void,
) {
  if (!hasKey(raw, key)) return;
  assign(sanitizeText(raw[key]));
}

function sanitizeText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new SessionValidationError('Text fields must be strings.');
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function sanitizeRequiredText(value: string | null | undefined, message: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new SessionValidationError(message);
  }
  return trimmed;
}

function parseCoordinate(value: unknown, label: string): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new SessionValidationError(`Field ${label} must be a valid number.`);
  }
  return num;
}

function parseIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SessionValidationError(`Field ${label} must be an ISO date string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SessionValidationError(`Field ${label} is not a valid date.`);
  }
  return date.toISOString();
}

function ensureChronology(startsAt: string, endsAt: string) {
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new SessionValidationError('End time must be after the start time.');
  }
}

function resolvePriceCents(raw: Record<string, unknown>): number | null {
  if (hasKey(raw, 'priceCents')) {
    return normalizePriceCents(raw.priceCents);
  }
  if (hasKey(raw, 'price_cents')) {
    return normalizePriceCents(raw.price_cents);
  }
  if (hasKey(raw, 'price')) {
    const priceValue = Number(raw.price);
    if (!Number.isFinite(priceValue)) {
      throw new SessionValidationError('Price must be a number.');
    }
    return normalizePriceCents(priceValue * 100);
  }
  return null;
}

function normalizePriceCents(value: unknown): number {
  const cents = Math.round(Number(value));
  if (!Number.isFinite(cents) || cents < 0) {
    throw new SessionValidationError('Price cannot be negative.');
  }
  return cents;
}

function resolveMaxAttendees(raw: Record<string, unknown>): number | null {
  if (!hasKey(raw, 'maxAttendees') && !hasKey(raw, 'max_attendees')) return null;
  const value = hasKey(raw, 'maxAttendees') ? raw.maxAttendees : raw.max_attendees;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new SessionValidationError('maxAttendees must be a positive number.');
  }
  return Math.floor(num);
}

function resolveVisibility(
  raw: Record<string, unknown>,
  fallback?: SessionVisibility,
): SessionVisibility | undefined {
  const value = hasKey(raw, 'visibility') ? raw.visibility : undefined;
  if (value == null) return fallback;
  if (typeof value !== 'string') {
    throw new SessionValidationError('visibility must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'public' || normalized === 'friends' || normalized === 'private') {
    return normalized;
  }
  throw new SessionValidationError('visibility must be public, friends, or private.');
}

async function loadActivities(service: SupabaseClient, ids: string[]): Promise<Map<string, ActivitySummary>> {
  const map = new Map<string, ActivitySummary>();
  if (!ids.length) return map;
  const { data, error } = await service
    .from('activities')
    .select('id, name, description, venue, lat, lng')
    .in('id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      name: row.name ?? null,
      description: row.description ?? null,
      venueLabel: row.venue ?? null,
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
    });
  }
  return map;
}

async function loadVenues(service: SupabaseClient, ids: string[]): Promise<Map<string, VenueSummary>> {
  const map = new Map<string, VenueSummary>();
  if (!ids.length) return map;
  const { data, error } = await service
    .from('venues')
    .select('id, name, address, lat, lng')
    .in('id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      name: row.name ?? null,
      address: typeof row.address === 'string' ? row.address : null,
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
    });
  }
  return map;
}

async function loadPlaces(service: SupabaseClient, ids: string[]): Promise<Map<string, PlaceSummary>> {
  const map = new Map<string, PlaceSummary>();
  if (!ids.length) return map;
  const { data, error } = await service
    .from('places')
    .select('id, name, address, locality, region, country, lat, lng, categories, metadata')
    .in('id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row?.id) continue;
    const rawRow = row as Record<string, unknown>;
    const metadata = (typeof row.metadata === 'object' && row.metadata !== null)
      ? (row.metadata as Record<string, unknown>)
      : null;
    const kind = typeof rawRow.kind === 'string'
      ? String(rawRow.kind)
      : typeof metadata?.kind === 'string'
        ? String(metadata.kind)
        : null;
    map.set(row.id, {
      id: row.id,
      name: row.name ?? null,
      address: typeof row.address === 'string' ? row.address : null,
      locality: typeof row.locality === 'string' ? row.locality : null,
      region: typeof row.region === 'string' ? row.region : null,
      country: typeof row.country === 'string' ? row.country : null,
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      categories: Array.isArray(row.categories) ? row.categories : null,
      kind,
    });
  }
  return map;
}

async function loadProfiles(service: SupabaseClient, ids: string[]): Promise<Map<string, ProfileSummary>> {
  const map = new Map<string, ProfileSummary>();
  if (!ids.length) return map;
  const { data, error } = await service
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as Array<ProfileRow & { username?: string | null }>) {
    map.set(row.id, {
      id: row.id,
      username: row.username ?? null,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
    });
  }
  return map;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeReliabilityScore(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return clamped;
}

export async function getSessionOrThrow(service: SupabaseClient, sessionId: string): Promise<SessionRow> {
  const { data, error } = await service
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle<SessionRow>();
  if (error) throw error;
  if (!data) {
    throw new SessionValidationError('Session not found.', 404);
  }
  return data;
}

export async function getAttendanceCounts(service: SupabaseClient, sessionId: string): Promise<AttendanceCounts> {
  const [going, interested, declined, verified] = await Promise.all([
    countByStatus(service, sessionId, 'going'),
    countByStatus(service, sessionId, 'interested'),
    countByStatus(service, sessionId, 'declined'),
    countVerifiedMatches(service, sessionId),
  ]);
  return {
    going,
    interested,
    declined,
    total: going + interested + declined,
    verified,
  };
}

async function countByStatus(
  service: SupabaseClient,
  sessionId: string,
  status: SessionAttendeeRow['status'],
): Promise<number> {
  const { count, error } = await service
    .from('session_attendees')
    .select('status', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

async function countVerifiedMatches(service: SupabaseClient, sessionId: string): Promise<number> {
  const { count, error } = await service
    .from('session_attendees')
    .select('checked_in', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('attendance_status', 'attended')
    .eq('checked_in', true);
  if (error) throw error;
  return count ?? 0;
}

export async function getUserAttendanceStatus(
  service: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionAttendeeRow['status'] | null> {
  const { data, error } = await service
    .from('session_attendees')
    .select('status')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ status: SessionAttendeeRow['status'] }>();
  if (error) throw error;
  return data?.status ?? null;
}
