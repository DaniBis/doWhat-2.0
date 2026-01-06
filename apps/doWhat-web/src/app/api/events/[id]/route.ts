import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';

const PLACE_SELECTION = 'id,name,lat,lng,address,locality,region,country,categories';

const fetchPlace = async (client: ReturnType<typeof createServiceClient>, placeId: string | null) => {
  if (!placeId) return null;
  const { data, error } = await client
    .from('places')
    .select(PLACE_SELECTION)
    .eq('id', placeId)
    .maybeSingle();
  if (error) {
    console.warn('[event-detail-api] place lookup failed', error.message);
    return null;
  }
  return data ?? null;
};

export async function GET(_request: Request, context: { params: { id: string } }) {
  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from('events')
    .select('id,title,description,start_at,end_at,timezone,venue_name,lat,lng,address,url,image_url,status,tags,place_id,source_id,source_uid,metadata')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const place = await fetchPlace(client, data.place_id ?? null);
  return NextResponse.json({ event: { ...data, place } });
}
