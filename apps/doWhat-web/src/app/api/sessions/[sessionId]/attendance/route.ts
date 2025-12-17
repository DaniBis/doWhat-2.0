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

interface RouteContext {
  params: { sessionId: string };
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const sessionId = sanitizeId(context.params.sessionId);
    if (!sessionId) {
      throw new SessionValidationError('Session id is required.');
    }

    const service = createServiceClient();
    const session = await getSessionOrThrow(service, sessionId);

    const [user, counts] = await Promise.all([
      resolveApiUser(req),
      getAttendanceCounts(service, sessionId),
    ]);
    const status = user ? await getUserAttendanceStatus(service, sessionId, user.id) : null;

    return NextResponse.json({
      sessionId,
      status,
      counts,
      userId: user?.id ?? null,
      maxAttendees: session.max_attendees,
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
