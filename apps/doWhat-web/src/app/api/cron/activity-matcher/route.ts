import { NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/cron/auth';
import { matchActivitiesForPlaces } from '@/lib/places/activityMatching';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const city = sanitize(url.searchParams.get('city'));
  const placeId = sanitize(url.searchParams.get('placeId'));
  const dryRun = parseBoolean(url.searchParams.get('dryRun'));

  let limit: number | undefined;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 });
    }
    limit = Math.min(parsed, 500);
  }

  try {
    const result = await matchActivitiesForPlaces({ limit, city, placeId, dryRun });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Activity matcher failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const parseBoolean = (value: string | null): boolean => value === '1' || value === 'true';
const sanitize = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};
