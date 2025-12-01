import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import { enrichVenueActivities } from '@/lib/venues/enrichment';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';
import { serializeVenueRow } from '@/lib/venues/api';

export const dynamic = 'force-dynamic';

const validateSecret = (request: Request): boolean => {
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('cron_secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return headerSecret === secret || querySecret === secret;
};

type RouteContext = { params: { id: string } };

type EnrichRequestBody = {
  foursquareId: string | null;
  googlePlaceId: string | null;
  force: boolean;
};

export async function POST(request: Request, context: RouteContext) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = context.params?.id?.trim();
  if (!venueId) {
    return NextResponse.json({ error: 'Venue id is required.' }, { status: 400 });
  }

  let parsedBody: unknown = {};
  try {
    parsedBody = await request.json();
  } catch {
    parsedBody = {};
  }

  const body = normalizeBody(parsedBody);

  try {
    const supabase = createServiceClient();
    const result = await enrichVenueActivities({
      supabase,
      venueId,
      foursquareId: body.foursquareId ?? undefined,
      googlePlaceId: body.googlePlaceId ?? undefined,
      force: body.force,
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

function normalizeBody(payload: unknown): EnrichRequestBody {
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const foursquareId = coerceString(source.foursquareId);
  const googlePlaceId = coerceString(source.googlePlaceId);
  const force = source.force === true;
  return { foursquareId, googlePlaceId, force };
}

function coerceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
