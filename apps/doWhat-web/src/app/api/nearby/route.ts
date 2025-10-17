import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';
import { parseNearbyQuery } from '@/lib/filters';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

interface NearbyQuery {
  lat: number; lng: number; radiusMeters?: number; limit?: number;
  activityTypes?: string[]; tags?: string[]; traits?: string[];
}
interface NearbyActivityRow {
  id: string;
  name: string;
  venue: string | null;
  lat: number | null;
  lng: number | null;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
  participant_preferences?: { preferred_traits: string[] | null }[] | null;
}
interface RpcNearbyRow {
  id: string;
  name: string;
  venue: string | null;
  lat?: number;
  lng?: number;
  lat_out?: number;
  lng_out?: number;
  distance_m?: number;
  activity_types?: string[] | null;
  tags?: string[] | null;
  traits?: string[] | null;
}
interface ErrorPayload { error: string }

// GET /api/nearby?lat=..&lng=..&radius=2000&types=a,b&tags=x,y&traits=t1,t2&limit=50
const toRadians = (deg: number) => (deg * Math.PI) / 180;

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000; // metres
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
  const q = parseNearbyQuery(searchParams) as NearbyQuery;
    if (!q.lat || !q.lng) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const supabase = db();
    const skipRpc = Boolean(q.traits?.length);

    // Prefer PostGIS geom if present, fallback to simple haversine-like bbox using lat/lng
    // This query uses RPC via SQL embedded in PostgREST through Supabase's JS client using .rpc would need a function.
    // Instead we filter by ST_DWithin if geom exists; otherwise approximate by a lat/lng bounding box.

    // Try PostGIS RPC first; on failure, fall back to bbox on lat/lng
    if (!skipRpc) {
      try {
        const rpcPayload: Record<string, unknown> = {
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
            activities: (rpcData as RpcNearbyRow[]).map(r => ({
              id: r.id,
              name: r.name,
              venue: r.venue,
              lat: (r.lat_out ?? r.lat) ?? null,
              lng: (r.lng_out ?? r.lng) ?? null,
              distance_m: r.distance_m,
              activity_types: r.activity_types ?? null,
              tags: r.tags ?? null,
              traits: r.traits ?? null,
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
    }

    // Fallback: bbox on lat/lng
    const fallbackLimit = Math.max(q.limit ?? 50, 1);
    const radiusMeters = Math.max(q.radiusMeters ?? 2000, 100);
    const lat = q.lat;
    const lng = q.lng;

    const { data: rawRows, error: rawError } = await supabase
      .from('activities')
      .select(`
        id,
        name,
        venue,
        lat,
        lng,
        activity_types,
        tags,
        traits,
        participant_preferences:activity_participant_preferences(preferred_traits)
      `)
      .limit(Math.max(200, fallbackLimit * 4))
      .returns<NearbyActivityRow[]>();

    if (rawError) {
      const message = rawError.message?.toLowerCase?.() ?? '';
      if (message.includes('ambiguous') || message.includes('column reference')) {
        // If PostgREST still complains, surface a friendlier message rather than leaking SQL jargon.
        throw new Error('Nearby locations are temporarily unavailable. Please try again soon.');
      }
      throw rawError;
    }

    const normalizeList = (values?: string[] | null) =>
      (values ?? []).map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')).filter(Boolean);

    const filteredRows = (rawRows ?? []).filter((row) => {
      const activityValues = normalizeList(row.activity_types);
      const tagValues = normalizeList(row.tags);
      const traitValues = new Set<string>([
        ...normalizeList(row.traits),
        ...((row.participant_preferences ?? [])
          .flatMap((pref) => normalizeList(pref?.preferred_traits ?? null)) ?? []),
      ]);

      if (q.activityTypes?.length) {
        const want = normalizeList(q.activityTypes);
        if (!want.some((type) => activityValues.includes(type))) return false;
      }
      if (q.tags?.length) {
        const want = normalizeList(q.tags);
        if (!want.some((tag) => tagValues.includes(tag))) return false;
      }
      if (q.traits?.length) {
        const want = normalizeList(q.traits);
        if (!want.some((trait) => traitValues.has(trait))) return false;
      }
      return true;
    });

    const withDistance = filteredRows
      .map((row) => {
        if (typeof row.lat !== 'number' || typeof row.lng !== 'number') return null;
        const distance = haversineMeters(lat, lng, row.lat, row.lng);
        return { ...row, distance };
      })
      .filter((row): row is NearbyActivityRow & { distance: number } => Boolean(row));

    withDistance.sort((a, b) => a.distance - b.distance);

    const withinRadius = withDistance.filter((row) => row.distance <= radiusMeters);
    const chosen = (withinRadius.length ? withinRadius : withDistance).slice(0, fallbackLimit);

    return NextResponse.json({
      center: { lat: q.lat, lng: q.lng },
      radiusMeters,
      count: chosen.length,
      activities: chosen.map((row) => {
        const prefTraits = (row.participant_preferences ?? []).flatMap((pref) =>
          (pref?.preferred_traits ?? []).filter((trait): trait is string => typeof trait === 'string'),
        );
        const uniqueTraits = Array.from(
          new Set<string>([
            ...((row.traits ?? []).filter((trait): trait is string => typeof trait === 'string')),
            ...prefTraits,
          ]),
        );
        return {
          id: row.id,
          name: row.name,
          venue: row.venue,
          lat: row.lat,
          lng: row.lng,
          distance_m: row.distance,
          activity_types: row.activity_types ?? null,
          tags: row.tags ?? null,
          traits: uniqueTraits.length ? uniqueTraits : null,
        };
      }),
      source: 'client-filter',
    });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Nearby error', error);
    return NextResponse.json<ErrorPayload>({ error: getErrorMessage(error) }, { status: 500 });
  }
}
