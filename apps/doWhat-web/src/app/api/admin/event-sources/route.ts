import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';

const allowedTypes = new Set(['ics', 'rss', 'jsonld']);

const validateSecret = (request: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('cron_secret');
  return headerSecret === secret || querySecret === secret;
};

export async function POST(request: Request) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
  const venueHint = typeof body.venue_hint === 'string' ? body.venue_hint.trim() : null;
  const city = typeof body.city === 'string' ? body.city.trim() : null;
  const fetchInterval = Number.isFinite(Number(body.fetch_interval_minutes))
    ? Number(body.fetch_interval_minutes)
    : null;

  if (!url || !type || !allowedTypes.has(type)) {
    return NextResponse.json({ error: 'Missing or invalid url/type' }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from('event_sources')
    .insert({
      url,
      type,
      venue_hint: venueHint,
      city,
      fetch_interval_minutes: fetchInterval,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data });
}
