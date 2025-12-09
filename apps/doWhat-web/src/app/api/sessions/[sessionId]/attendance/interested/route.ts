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

    const service = createServiceClient();
    await getSessionOrThrow(service, sessionId);

    const previousStatus = await getUserAttendanceStatus(service, sessionId, user.id);

    const { error } = await service
      .from('session_attendees')
      .upsert({ session_id: sessionId, user_id: user.id, status: 'interested' }, { onConflict: 'session_id,user_id' });
    if (error) throw error;

    const counts = await getAttendanceCounts(service, sessionId);
    return NextResponse.json({
      sessionId,
      userId: user.id,
      status: 'interested' as AttendeeStatus,
      previousStatus,
      counts,
    });
  } catch (error) {
    return handleError(error);
  }
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
