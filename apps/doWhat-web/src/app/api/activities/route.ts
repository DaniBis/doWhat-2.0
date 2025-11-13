import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Placeholder endpoint. Real implementation can be added later.
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Activities endpoint not implemented yet.' });
}
