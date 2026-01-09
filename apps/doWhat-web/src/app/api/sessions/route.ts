import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import {
  ensureActivity,
  ensureVenue,
  extractSessionPayload,
  hydrateSessions,
  resolveSessionPlaceId,
  resolveApiUser,
  SessionValidationError,
} from '@/lib/sessions/server';

export async function GET(req: Request) {
  try {
    const service = createServiceClient();
    const url = new URL(req.url);
    const activityId = sanitizeId(url.searchParams.get('activityId'));
    const venueId = sanitizeId(url.searchParams.get('venueId'));
    if (!activityId && !venueId) {
      throw new SessionValidationError('activityId or venueId is required to list sessions.');
    }

    const limitParam = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 200) : 50;

    let query = service.from('sessions').select('*').order('starts_at', { ascending: true }).limit(limit);
    if (activityId) query = query.eq('activity_id', activityId);
    if (venueId) query = query.eq('venue_id', venueId);

    const { data, error } = await query;
    if (error) throw error;

    const sessions = await hydrateSessions(service, data ?? []);
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const body = await req.json();
    const payload = extractSessionPayload(body, {
      requireSchedule: true,
      requireCoordinates: true,
      defaultVisibility: 'public',
      defaultMaxAttendees: 20,
      defaultPriceCents: 0,
    });

    const service = createServiceClient();
    const placeId = await resolveSessionPlaceId(service, {
      activityId: payload.activityId,
      lat: payload.lat,
      lng: payload.lng,
      labelHint: payload.venueName ?? payload.activityName ?? null,
    });

    const activityId = await ensureActivity(service, {
      activityId: payload.activityId,
      activityName: payload.activityName,
      lat: payload.lat,
      lng: payload.lng,
      venueName: payload.venueName,
      placeId,
    });
    const venueId = await ensureVenue(service, {
      venueId: payload.venueId,
      venueName: payload.venueName,
      lat: payload.lat,
      lng: payload.lng,
    });

    const sessionInsert = {
      activity_id: activityId,
      venue_id: venueId,
      host_user_id: user.id,
      starts_at: payload.startsAt!,
      ends_at: payload.endsAt!,
      price_cents: payload.priceCents ?? 0,
      max_attendees: payload.maxAttendees ?? 20,
      visibility: payload.visibility ?? 'public',
      description: payload.description ?? null,
      place_id: placeId,
    };

    const { data: sessionRow, error: sessionError } = await service
      .from('sessions')
      .insert(sessionInsert)
      .select('*')
      .single();
    if (sessionError) throw sessionError;

    await service
      .from('session_attendees')
      .upsert({ session_id: sessionRow.id, user_id: user.id, status: 'going' }, { onConflict: 'session_id,user_id' });

    await revalidateSessionPaths(sessionRow.activity_id, sessionRow.id, sessionRow.venue_id);

    const [hydrated] = await hydrateSessions(service, [sessionRow]);
    return NextResponse.json({ session: hydrated }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

async function revalidateSessionPaths(activityId?: string | null, sessionId?: string | null, venueId?: string | null) {
  const paths = new Set(['/', '/map']);
  if (activityId) paths.add(`/activities/${activityId}`);
  if (sessionId) paths.add(`/sessions/${sessionId}`);
  if (venueId) paths.add(`/venues/${venueId}/schedule`);
  await Promise.all(Array.from(paths).map((path) => revalidatePath(path)));
}

function sanitizeId(value: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function handleError(error: unknown) {
  if (error instanceof SessionValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  let message = getErrorMessage(error);
  if (/row-level security/i.test(message)) {
    message = 'Operation blocked by Supabase Row Level Security. Update your policies to allow this action.';
  }
  return NextResponse.json({ error: message }, { status: 500 });
}
