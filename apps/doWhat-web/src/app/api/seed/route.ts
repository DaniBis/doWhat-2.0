import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Placeholder seed endpoint. Implement DB seeding as needed.
  return NextResponse.json({ ok: true, seeded: 0 });
}
