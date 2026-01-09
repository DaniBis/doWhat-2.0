import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { resolvePlaceFromCoordsWithClient } from '@/lib/places/resolver';
import {
  ensureActivity,
  ensureVenue,
  extractSessionPayload,
  getSessionOrThrow,
  hydrateSessions,
  resolveApiUser,
  SessionValidationError,
} from '@/lib/sessions/server';

interface RouteContext {
  params: { sessionId: string };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError('Session id is required.');
    }
    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);
    const [hydrated] = await hydrateSessions(service, [session]);
    return NextResponse.json({ session: hydrated });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError('Session id is required.');
    }

    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);
    if (session.host_user_id !== user.id) {
      return NextResponse.json({ error: 'Only the host can update this session.' }, { status: 403 });
    }

    const body = await req.json();
    const payload = extractSessionPayload(body);

    const canResolvePlace =
      typeof payload.lat === 'number' && Number.isFinite(payload.lat) &&
      typeof payload.lng === 'number' && Number.isFinite(payload.lng);
    const placeResolution = canResolvePlace
      ? await resolvePlaceFromCoordsWithClient(service, {
          lat: payload.lat!,
          lng: payload.lng!,
          labelHint: payload.venueName ?? payload.activityName ?? null,
          source: 'session-api',
        })
      : null;

    const updates: Record<string, unknown> = {};
    if (payload.startsAt) updates.starts_at = payload.startsAt;
    if (payload.endsAt) updates.ends_at = payload.endsAt;
    if (payload.priceCents != null) updates.price_cents = payload.priceCents;
    if (payload.maxAttendees != null) updates.max_attendees = payload.maxAttendees;
    if (payload.visibility) updates.visibility = payload.visibility;
    if (payload.description !== undefined) updates.description = payload.description;
    if (placeResolution) {
      updates.place_id = placeResolution.placeId;
    }

    if (payload.startsAt || payload.endsAt) {
      const nextStartsAt = payload.startsAt ?? session.starts_at;
      const nextEndsAt = payload.endsAt ?? session.ends_at;
      if (new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
        throw new SessionValidationError('End time must be after the start time.');
      }
    }

    const activityUpdateRequested = payload.activityId !== undefined || payload.activityName !== undefined;
    if (activityUpdateRequested) {
      const activityId = await ensureActivity(service, {
        activityId: payload.activityId,
        activityName: payload.activityName,
        lat: payload.lat,
        lng: payload.lng,
        venueName: payload.venueName,
        placeId: placeResolution?.placeId,
      });
      updates.activity_id = activityId;
    }

    const venueUpdateRequested = payload.venueId !== undefined || payload.venueName !== undefined;
    if (venueUpdateRequested) {
      const venueId = await ensureVenue(service, {
        venueId: payload.venueId,
        venueName: payload.venueName,
        lat: payload.lat,
        lng: payload.lng,
      });
      updates.venue_id = venueId;
    }

    if (!Object.keys(updates).length) {
      const [hydrated] = await hydrateSessions(service, [session]);
      return NextResponse.json({ session: hydrated });
    }

    const { data: updated, error: updateError } = await service
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
      .select('*')
      .single();
    if (updateError) throw updateError;

    await revalidateSessionPaths(updated.activity_id, updated.id, updated.venue_id);

    const [hydrated] = await hydrateSessions(service, [updated]);
    return NextResponse.json({ session: hydrated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError('Session id is required.');
    }

    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);
    if (session.host_user_id !== user.id) {
      return NextResponse.json({ error: 'Only the host can delete this session.' }, { status: 403 });
    }

    await service.from('session_attendees').delete().eq('session_id', sessionId);
    const { error: deleteError } = await service.from('sessions').delete().eq('id', sessionId);
    if (deleteError) throw deleteError;

    await revalidateSessionPaths(session.activity_id, session.id, session.venue_id);

    return NextResponse.json({ success: true });
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

function sanitizeId(value: string | null | undefined): string | null {
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
