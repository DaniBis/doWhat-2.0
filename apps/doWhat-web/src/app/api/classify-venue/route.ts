import { NextResponse } from 'next/server';

import { rateLimit } from '@/lib/rateLimit';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { createServiceClient } from '@/lib/supabase/service';
import { enrichVenueActivities } from '@/lib/venues/enrichment';
import { serializeVenueRow } from '@/lib/venues/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RATE_LIMIT = { capacity: 30, intervalMs: 60_000 };

type ClassifyBody = {
  venueId: string | null;
  foursquareId?: string | null;
  googlePlaceId?: string | null;
  force?: boolean | null;
};

export async function POST(request: Request) {
  const secretOk = validateSecret(request);
  if (!secretOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ipKey = rateLimitKey(request, 'classify-venue');
  if (!rateLimit(ipKey, RATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let payload: ClassifyBody = { venueId: null };
  try {
    payload = (await request.json()) as ClassifyBody;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const venueId = payload.venueId?.trim();
  if (!venueId) {
    return NextResponse.json({ error: 'venueId is required.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const result = await enrichVenueActivities({
      supabase,
      venueId,
      foursquareId: coerceString(payload.foursquareId) ?? undefined,
      googlePlaceId: coerceString(payload.googlePlaceId) ?? undefined,
      force: payload.force === true,
    });

    return NextResponse.json({
      venue: serializeVenueRow(result.venue),
      classification: result.classification ?? null,
      externalRecord: result.externalRecord ?? null,
      providerDiagnostics: result.providerDiagnostics,
      refreshed: result.refreshed,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function validateSecret(request: Request): boolean {
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('cron_secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return headerSecret === secret || querySecret === secret;
}

function coerceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function rateLimitKey(request: Request, label: string) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  return `${label}:${ip}`;
}
