import { NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/cron/auth';
import { ingestEvents } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const summary = await ingestEvents();
  return NextResponse.json(summary);
}
