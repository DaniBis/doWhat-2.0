import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';

const MAX_LIMIT = 200;

const parseCoordinatePair = (value: string | null): { lat: number; lng: number } | null => {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) return null;
  return { lat: latRaw, lng: lngRaw };
};

const parseIso = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sw = parseCoordinatePair(url.searchParams.get('sw'));
  const ne = parseCoordinatePair(url.searchParams.get('ne'));
  const fromIso = parseIso(url.searchParams.get('from'));
  const toIso = parseIso(url.searchParams.get('to'));
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : 100;
  const categoriesParam = url.searchParams.get('categories');
  const categories = categoriesParam
    ? categoriesParam
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];

  const client = createServiceClient();
  let query = client
    .from('events')
    .select(
      `id,title,description,start_at,end_at,timezone,venue_name,lat,lng,address,url,image_url,status,tags,place_id,source_id,source_uid,metadata,
       place:places(id,name,lat,lng,address,locality,region,country,categories)`
    )
    .order('start_at', { ascending: true })
    .limit(limit);

  if (fromIso) {
    query = query.gte('start_at', fromIso);
  }
  if (toIso) {
    query = query.lte('start_at', toIso);
  }
  if (sw && ne) {
    query = query.gte('lat', sw.lat).lte('lat', ne.lat).gte('lng', sw.lng).lte('lng', ne.lng);
  }
  if (categories.length) {
    query = query.overlaps('tags', categories);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
