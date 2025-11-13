import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';

export async function GET(_request: Request, context: { params: { id: string } }) {
  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from('events')
    .select(
      `id,title,description,start_at,end_at,timezone,venue_name,lat,lng,address,url,image_url,status,tags,place_id,source_id,source_uid,metadata,
       place:places(id,name,lat,lng,address,locality,region,country,categories)`
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ event: data });
}
