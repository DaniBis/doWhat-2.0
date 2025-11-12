import { NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/cron/auth';
import { warmBangkokTiles } from '@/lib/places/bangkokWarm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const countParam = url.searchParams.get('count');
  const count = countParam ? Number.parseInt(countParam, 10) : undefined;

  if (countParam && Number.isNaN(count ?? Number.NaN)) {
    return NextResponse.json({ error: 'Invalid count parameter' }, { status: 400 });
  }

  const result = await warmBangkokTiles(count ?? undefined);
  return NextResponse.json(result);
}
