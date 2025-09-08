import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';
import { parseNearbyQuery } from '@/lib/filters';

// GET /api/nearby?lat=..&lng=..&radius=2000&types=a,b&tags=x,y&traits=t1,t2&limit=50
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = parseNearbyQuery(searchParams);
    if (!q.lat || !q.lng) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const supabase = db();

    // Prefer PostGIS geom if present, fallback to simple haversine-like bbox using lat/lng
    // This query uses RPC via SQL embedded in PostgREST through Supabase's JS client using .rpc would need a function.
    // Instead we filter by ST_DWithin if geom exists; otherwise approximate by a lat/lng bounding box.

    // Build base select with joins for sessions count
    let query = supabase
      .from('activities')
      .select(`id, name, venue, lat, lng`)
      .limit(q.limit || 50);

    // activity_types filter
    // activityTypes/tags filtering skipped unless columns exist in the DB

    // People trait filter is left for future join; for now it is a no-op

    // Try PostGIS RPC first; on failure, fall back to bbox on lat/lng
    try {
      const rpcPayload: any = {
        lat: q.lat,
        lng: q.lng,
        radius_m: q.radiusMeters ?? 2000,
        limit_rows: q.limit ?? 50,
      };
      if (q.activityTypes?.length) rpcPayload.types = q.activityTypes;
      if (q.tags?.length) rpcPayload.tags = q.tags;
      const { data: rpcData, error: rpcError } = await supabase.rpc('activities_nearby', rpcPayload);
      if (!rpcError && rpcData) {
        return NextResponse.json({
          center: { lat: q.lat, lng: q.lng },
          radiusMeters: q.radiusMeters || 2000,
          count: rpcData.length,
          activities: rpcData.map((r: any) => ({
            id: r.id,
            name: r.name,
            venue: r.venue,
            lat: r.lat_out ?? r.lat,
            lng: r.lng_out ?? r.lng,
            distance_m: r.distance_m,
          })),
          source: 'postgis',
        });
      }
      // eslint-disable-next-line no-console
      if (rpcError) console.warn('activities_nearby RPC failed, falling back:', rpcError?.message || rpcError);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('activities_nearby RPC exception, falling back:', e);
    }

    // Fallback: bbox on lat/lng
    {
      const dKm = Math.max((q.radiusMeters || 2000) / 1000, 0.1);
      const lat = q.lat;
      const lng = q.lng;
      const deltaLat = dKm / 111.32; // deg per km
      const deltaLng = dKm / (111.32 * Math.cos((lat * Math.PI) / 180));
      query = query
        .gte('lat', lat - deltaLat)
        .lte('lat', lat + deltaLat)
        .gte('lng', lng - deltaLng)
        .lte('lng', lng + deltaLng);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      center: { lat: q.lat, lng: q.lng },
      radiusMeters: q.radiusMeters || 2000,
      count: data?.length || 0,
      activities: data || [],
      source: 'bbox',
    });
  } catch (e: any) {
    console.error('Nearby error', e);
    const msg = e?.message || e?.error?.message || JSON.stringify(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
