import { NextResponse } from 'next/server';

// Legacy endpoint retained for backward compatibility only.
// Session attendance is now managed via /api/sessions/[sessionId]/attendance/* routes.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been replaced by /api/sessions/[sessionId]/attendance. Please migrate to the session_attendees flow.' },
    { status: 410 }
  );
}
