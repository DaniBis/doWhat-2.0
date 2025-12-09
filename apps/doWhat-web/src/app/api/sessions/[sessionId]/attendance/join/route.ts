import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import {
  getAttendanceCounts,
  getSessionOrThrow,
  getUserAttendanceStatus,
  resolveApiUser,
  SessionValidationError,
} from '@/lib/sessions/server';
import type { SessionAttendeeRow } from '@/types/database';

interface RouteContext {
  params: { sessionId: string };
}

type AttendeeStatus = SessionAttendeeRow['status'];
const JOINABLE_STATUSES: AttendeeStatus[] = ['going', 'interested'];

export async function POST(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError('Session id is required.');
    }

    const user = await resolveApiUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const desiredStatus = await resolveRequestedStatus(req, 'going');
    if (!JOINABLE_STATUSES.includes(desiredStatus)) {
      throw new SessionValidationError('Unsupported status.');
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);

    const existing = await getUserAttendanceStatus(service, sessionId, user.id);
    if (desiredStatus === 'going') {
      const counts = await getAttendanceCounts(service, sessionId);
      const effectiveGoing = counts.going - (existing === 'going' ? 1 : 0);
      if (effectiveGoing >= session.max_attendees) {
        throw new SessionValidationError('Session is full.', 409);
      }
    }

    const { error: upsertError } = await service
      .from('session_attendees')
      .upsert({ session_id: sessionId, user_id: user.id, status: desiredStatus }, { onConflict: 'session_id,user_id' });
    if (upsertError) throw upsertError;

    const counts = await getAttendanceCounts(service, sessionId);
    return NextResponse.json({
      sessionId,
      userId: user.id,
      status: desiredStatus,
      previousStatus: existing,
      counts,
    });
  } catch (error) {
    return handleError(error);
  }
}

async function resolveRequestedStatus(req: Request, fallback: AttendeeStatus): Promise<AttendeeStatus> {
  try {
    const body = await req.json();
    return parseStatus(body?.status ?? fallback, fallback);
  } catch {
    return fallback;
  }
}

function parseStatus(value: unknown, fallback: AttendeeStatus): AttendeeStatus {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'going' || normalized === 'interested') {
    return normalized;
  }
  return fallback;
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
