export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { filterOutSeedActivities, hasSeedMarker } from '@dowhat/shared';

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

type PublicNearbyActivity = {
  id: string;
  name: string;
  venue: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  activity_types: string[] | null;
  tags: string[] | null;
  traits: string[] | null;
};

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

const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const parseTagList = (value?: string) =>
  (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

const buildOverpassQuery = (lat: number, lng: number, radius: number, limit: number) => `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  node(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  node(around:${radius},${lat},${lng})["sport"];
  way(around:${radius},${lat},${lng})["leisure"~"^(sports_centre|fitness_centre|stadium|pitch|park)$"];
  way(around:${radius},${lat},${lng})["amenity"~"^(gym|sports_hall|swimming_pool|community_centre)$"];
  way(around:${radius},${lat},${lng})["sport"];
  relation(around:${radius},${lat},${lng})["sport"];
);
out center ${limit};
`;

const describeVenue = (tags: Record<string, string> | undefined): string | null => {
  if (!tags) return null;
  const parts = [tags['addr:street'], tags['addr:city']].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (tags['addr:full']) return tags['addr:full'];
  if (tags['addr:neighbourhood']) return tags['addr:neighbourhood'];
  return null;
};

const dedupeById = <T extends { id: string | number }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const isMissingParticipantPreferenceRelationship = (error: { message?: string | null; details?: string | null; hint?: string | null }): boolean => {
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return haystack.includes('activity_participant_preferences') && haystack.includes('relationship');
};

const fetchOverpassActivities = async (
  query: NearbyQuery,
  radiusMeters: number,
  limit: number,
): Promise<PublicNearbyActivity[]> => {
  const safeRadius = Math.max(250, Math.min(radiusMeters, 5000));
  const cappedLimit = Math.max(60, Math.min(limit * 3, 180));
  const overpassQuery = buildOverpassQuery(query.lat, query.lng, safeRadius, cappedLimit);

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = dedupeById(payload.elements ?? []);

  const normalizedTypes = (query.activityTypes ?? []).map((value) => value.trim().toLowerCase());
  const normalizedTags = (query.tags ?? []).map((value) => value.trim().toLowerCase());

  const activities: PublicNearbyActivity[] = [];

  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const tags = element.tags ?? {};
    const sports = parseTagList(tags.sport);
    const leisure = parseTagList(tags.leisure);
    const amenities = parseTagList(tags.amenity);
    const label =
      tags.name || sports[0] || leisure[0] || amenities[0] || tags['club'] || 'Local activity';

    const distance = haversineMeters(query.lat, query.lng, lat, lng);

    const normalizedSet = new Set(
      [...sports, ...leisure, ...amenities].map((value) => value.trim().toLowerCase()),
    );

    if (normalizedTypes.length && !normalizedTypes.some((type) => normalizedSet.has(type))) {
      continue;
    }
    if (normalizedTags.length && !normalizedTags.some((tag) => normalizedSet.has(tag))) {
      continue;
    }

    const combinedTags = Array.from(new Set<string>([
      ...sports,
      ...leisure,
      ...amenities,
      ...(tags.club ? parseTagList(tags.club) : []),
      ...(tags.cuisine ? parseTagList(tags.cuisine) : []),
      'osm',
    ]));

    activities.push({
      id: `${element.type}:${element.id}`,
      name: label,
      venue: describeVenue(tags),
      lat,
      lng,
      activity_types: sports.length ? sports : leisure.length ? leisure : null,
      tags: combinedTags.length ? combinedTags : null,
      traits: null,
      distance_m: distance,
    });
  }

  activities.sort((a, b) => a.distance_m - b.distance_m);

  return activities.slice(0, limit);
};

const respondWithOverpass = async (
  query: NearbyQuery,
  radiusMeters: number,
  limit: number,
  options?: { degraded?: boolean; cause?: unknown },
) => {
  const degradedMeta = options?.degraded ? { degraded: true } : {};
  const fallbackErrorMeta = options?.degraded && options?.cause
    ? { fallbackError: getErrorMessage(options.cause) }
    : {};

  try {
    const external = await fetchOverpassActivities(query, radiusMeters, limit);
    if (external.length > 0) {
      return Response.json({
        center: { lat: query.lat, lng: query.lng },
        radiusMeters,
        count: external.length,
        activities: external.map((activity) => ({
          id: activity.id,
          name: activity.name,
          venue: activity.venue,
          lat: activity.lat,
          lng: activity.lng,
          distance_m: activity.distance_m,
          activity_types: activity.activity_types,
          tags: activity.tags,
          traits: activity.traits,
        })),
        source: 'osm-overpass',
        ...degradedMeta,
        ...fallbackErrorMeta,
      });
    }

    return Response.json({
      center: { lat: query.lat, lng: query.lng },
      radiusMeters,
      count: 0,
      activities: [],
      source: 'empty',
      ...degradedMeta,
      ...fallbackErrorMeta,
    });
  } catch (fallbackError) {
    // eslint-disable-next-line no-console
    console.error('Nearby fallback error', fallbackError);
    const payload: ErrorPayload = { error: getErrorMessage(options?.cause ?? fallbackError) };
    return Response.json(payload, { status: 500 });
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = parseNearbyQuery(searchParams) as NearbyQuery;
  if (!q.lat || !q.lng) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const fallbackLimit = Math.max(q.limit ?? 50, 1);
  const radiusMeters = Math.max(q.radiusMeters ?? 2000, 100);

  try {

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
          const cleaned = (rpcData as RpcNearbyRow[]).filter((row) => !hasSeedMarker(row));
          if (cleaned.length) {
          return Response.json({
            center: { lat: q.lat, lng: q.lng },
            radiusMeters: q.radiusMeters || 2000,
            count: cleaned.length,
            activities: cleaned.map(r => ({
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
        }
        // eslint-disable-next-line no-console
        if (rpcError) console.warn('activities_nearby RPC failed, falling back:', rpcError?.message || rpcError);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('activities_nearby RPC exception, falling back:', e);
      }
    }

    // Fallback: bbox on lat/lng
    const lat = q.lat;
    const lng = q.lng;

    const baseSelectCore = `
        id,
        name,
        venue,
        lat,
        lng,
        activity_types,
        tags
      `;

    const buildSelect = ({ includePreferences, includeTraits }: { includePreferences: boolean; includeTraits: boolean }) => {
      const fields = includeTraits ? `${baseSelectCore}, traits` : baseSelectCore;
      if (includePreferences) {
        return `${fields}, participant_preferences:activity_participant_preferences(preferred_traits)`;
      }
      return fields;
    };

    const executeActivitiesSelect = async (options: { includePreferences: boolean; includeTraits: boolean }) =>
      supabase
        .from('activities')
        .select(buildSelect(options))
        .limit(Math.max(200, fallbackLimit * 4))
        .returns<NearbyActivityRow[]>();

    let includePreferences = true;
    let includeTraits = true;
    let rawRowsResult = await executeActivitiesSelect({ includePreferences, includeTraits });
    let rawRows = rawRowsResult.data ?? null;

    for (let attempt = 0; rawRowsResult.error && attempt < 3; attempt += 1) {
      const message = rawRowsResult.error.message?.toLowerCase?.() ?? '';
      if (includePreferences && isMissingParticipantPreferenceRelationship(rawRowsResult.error)) {
        includePreferences = false;
      } else if (includeTraits && message.includes('does not exist')) {
        includeTraits = false;
      } else {
        break;
      }

      rawRowsResult = await executeActivitiesSelect({ includePreferences, includeTraits });
      rawRows = rawRowsResult.data ?? null;
    }

    if (rawRowsResult.error) {
      const message = rawRowsResult.error.message?.toLowerCase?.() ?? '';
      if (message.includes('ambiguous') || message.includes('column reference')) {
        // If PostgREST still complains, surface a friendlier message rather than leaking SQL jargon.
        throw new Error('Nearby locations are temporarily unavailable. Please try again soon.');
      }
      throw rawRowsResult.error;
    }

    if (rawRows && !includePreferences) {
      rawRows = rawRows.map((row) => ({ ...row, participant_preferences: null }));
    }
    if (rawRows && !includeTraits) {
      rawRows = rawRows.map((row) => ({ ...row, traits: null }));
    }

    const normalizeList = (values?: string[] | null) =>
      (values ?? []).map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')).filter(Boolean);

    const sanitizedRows = filterOutSeedActivities(rawRows);

    const filteredRows = sanitizedRows.filter((row) => {
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
    const chosen = withinRadius.slice(0, fallbackLimit);

    if (chosen.length > 0) {
      return Response.json({
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
    }

    return respondWithOverpass(q, radiusMeters, fallbackLimit);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Nearby error', error);
    return respondWithOverpass(q, radiusMeters, fallbackLimit, { degraded: true, cause: error });
  }
}
