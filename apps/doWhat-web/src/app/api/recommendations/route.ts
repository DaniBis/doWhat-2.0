export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { buildActivityRecommendations } from '@/lib/recommendations/engine';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

const parseNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const clampLimit = (value: number | null, fallback: number): number => {
  if (!value) return fallback;
  return Math.max(3, Math.min(24, Math.round(value)));
};

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const lat = parseNumber(url.searchParams.get('lat'));
  const lng = parseNumber(url.searchParams.get('lng'));
  const limit = clampLimit(parseNumber(url.searchParams.get('limit')), 12);

  try {
    const payload = await buildActivityRecommendations({
      supabase,
      userId: user.id,
      lat,
      lng,
      limit,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[recommendations] failed to build recommendations', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
