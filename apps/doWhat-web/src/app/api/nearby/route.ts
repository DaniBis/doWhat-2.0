export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { filterOutSeedActivities, hasSeedMarker } from '@dowhat/shared';

import { db } from '@/lib/db';
import { parseNearbyQuery } from '@/lib/filters';
import { hydratePlaceLabel, normalizePlaceLabel } from '@/lib/places/labels';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

interface NearbyQuery {
  lat: number; lng: number; radiusMeters?: number; limit?: number;
  activityTypes?: string[]; tags?: string[]; traits?: string[];
}
interface NearbyActivityRow {
  id: string;
  name: string;
  venue: string | null;
  place_id?: string | null;
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
  place_id?: string | null;
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

interface UpcomingSessionRow {
  activity_id: string | null;
}

type PublicNearbyActivity = {
  id: string;
  name: string;
  venue: string | null;
  place_id: string | null;
  place_label: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  activity_types: string[] | null;
  tags: string[] | null;
  traits: string[] | null;
  upcoming_session_count?: number;
};

type VenueFallbackRow = {
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  ai_activity_tags?: string[] | null;
  verified_activities?: string[] | null;
  updated_at?: string | null;
};

type PlaceRow = {
  id: string;
  name: string | null;
};

const isMissingColumnError = (error: { code?: string | null; message?: string | null; hint?: string | null }, columnName: string) => {
  if (!error) return false;
  if (error.code === '42703') return true;
  const haystack = `${error.message ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase());
};

const sanitizeCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const displayStringList = (values?: (string | null)[] | null): string[] | null => {
  const entries = (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => Boolean(value));
  return entries.length ? entries : null;
};

const toMapActivityFromVenue = (
  row: VenueFallbackRow,
  origin: { lat: number; lng: number },
): PublicNearbyActivity | null => {
  if (!row?.id) return null;
  const lat = sanitizeCoordinate(row.lat);
  const lng = sanitizeCoordinate(row.lng);
  if (lat == null || lng == null) return null;
  const placeLabel = normalizePlaceLabel(row.name, row.address);
  return {
    id: `venue:${row.id}`,
    name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Nearby venue',
    venue: row.address ?? null,
    place_id: null,
    place_label: placeLabel,
    lat,
    lng,
    distance_m: haversineMeters(origin.lat, origin.lng, lat, lng),
    activity_types: displayStringList(row.verified_activities ?? null),
    tags: displayStringList(row.ai_activity_tags ?? null),
    traits: null,
  };
};

const metersToLatDelta = (meters: number) => meters / 111_320;
const metersToLngDelta = (meters: number, latitude: number) => {
  const radians = (latitude * Math.PI) / 180;
  const denominator = Math.max(Math.cos(radians), 0.00001) * 111_320;
  return meters / denominator;
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

const fetchPlaceMap = async (client: ReturnType<typeof db>, placeIds: string[]) => {
  const map = new Map<string, PlaceRow>();
  if (!placeIds.length) return map;
  const { data, error } = await client
    .from('places')
    .select('id,name')
    .in('id', placeIds);
  if (error) {
    console.warn('[nearby] failed to hydrate place labels', error.message ?? error);
    return map;
  }
  for (const row of data ?? []) {
    if (row?.id) {
      map.set(row.id, { id: row.id, name: row.name ?? null });
    }
  }
  return map;
};

const applyPlaceLabels = (
  activities: PublicNearbyActivity[],
  placeMap: Map<string, PlaceRow>,
): PublicNearbyActivity[] =>
  activities.map((activity) => {
    if (!activity.place_id) {
      const fallback = hydratePlaceLabel({ venue: activity.venue ?? null });
      return { ...activity, place_label: activity.place_label ?? fallback };
    }
    const place = placeMap.get(activity.place_id) ?? null;
    return {
      ...activity,
      place_label: hydratePlaceLabel({
        place,
        venue: activity.venue ?? null,
      }),
    };
  });

const hydrateActivitiesWithPlaces = async (
  client: ReturnType<typeof db>,
  activities: PublicNearbyActivity[],
) => {
  const placeIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.place_id)
        .filter((placeId): placeId is string => typeof placeId === 'string' && placeId.trim().length > 0),
    ),
  );
  const placeMap = await fetchPlaceMap(client, placeIds);
  return applyPlaceLabels(activities, placeMap);
};

const fetchVenueFallbackActivities = async (
  client: ReturnType<typeof db>,
  query: NearbyQuery,
  radiusMeters: number,
  limit: number,
): Promise<PublicNearbyActivity[]> => {
  const latDelta = metersToLatDelta(radiusMeters * 1.2);
  const lngDelta = metersToLngDelta(radiusMeters * 1.2, query.lat);
  const swLat = query.lat - latDelta;
  const neLat = query.lat + latDelta;
  const swLng = query.lng - lngDelta;
  const neLng = query.lng + lngDelta;
  const buildVenueQuery = (columns: string) =>
    client
      .from('venues')
      .select(columns)
      .gte('lat', swLat)
      .lte('lat', neLat)
      .gte('lng', swLng)
      .lte('lng', neLng)
      .limit(Math.max(limit * 2, 40))
      .returns<VenueFallbackRow[]>();

  let data: VenueFallbackRow[] | null = null;
  let error: { code?: string | null; message?: string | null; hint?: string | null } | null = null;

  const primary = await buildVenueQuery('id,name,address,lat,lng,ai_activity_tags,verified_activities,updated_at')
    .order('updated_at', { ascending: false });

  data = primary.data;
  error = primary.error;

  if (error && isMissingColumnError(error, 'updated_at')) {
    console.warn('[nearby] venues.updated_at missing, re-running fallback query without column');
    const fallback = await buildVenueQuery('id,name,address,lat,lng,ai_activity_tags,verified_activities');
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => toMapActivityFromVenue(row, { lat: query.lat, lng: query.lng }))
    .filter((activity): activity is PublicNearbyActivity => Boolean(activity))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
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
    const venueDescription = describeVenue(tags);
    const placeLabel = normalizePlaceLabel(venueDescription, label);

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
      venue: venueDescription,
      place_id: null,
      place_label: placeLabel,
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
) => {
  const external = await fetchOverpassActivities(query, radiusMeters, limit);
  return {
    center: { lat: query.lat, lng: query.lng },
    radiusMeters,
    count: external.length,
    activities: external,
    source: external.length ? 'osm-overpass' : 'empty',
  } as const;
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
            const rpcActivities = cleaned
              .map((row): PublicNearbyActivity | null => {
                const lat = row.lat_out ?? row.lat;
                const lng = row.lng_out ?? row.lng;
                if (typeof lat !== 'number' || typeof lng !== 'number') return null;
                return {
                  id: row.id,
                  name: row.name,
                  venue: row.venue,
                  place_id: row.place_id ?? null,
                  place_label: null,
                  lat,
                  lng,
                  distance_m: row.distance_m ?? 0,
                  activity_types: row.activity_types ?? null,
                  tags: row.tags ?? null,
                  traits: row.traits ?? null,
                };
              })
              .filter((row): row is PublicNearbyActivity => Boolean(row));
            const hydratedActivities = await hydrateActivitiesWithPlaces(supabase, rpcActivities);
            return Response.json({
              center: { lat: q.lat, lng: q.lng },
              radiusMeters: q.radiusMeters || 2000,
              count: hydratedActivities.length,
              activities: hydratedActivities,
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

    const buildSelect = ({ includePreferences, includeTraits, includePlaceMetadata }: { includePreferences: boolean; includeTraits: boolean; includePlaceMetadata: boolean }) => {
      let fields = includeTraits ? `${baseSelectCore}, traits` : baseSelectCore;
      if (includePlaceMetadata) {
        fields = `${fields}, place_id`;
      }
      if (includePreferences) {
        return `${fields}, participant_preferences:activity_participant_preferences(preferred_traits)`;
      }
      return fields;
    };

    const executeActivitiesSelect = async (options: { includePreferences: boolean; includeTraits: boolean; includePlaceMetadata: boolean }) =>
      supabase
        .from('activities')
        .select(buildSelect(options))
        .limit(Math.max(200, fallbackLimit * 4))
        .returns<NearbyActivityRow[]>();

    let includePreferences = Boolean(q.traits?.length);
    let includeTraits = true;
    let includePlaceMetadata = true;
    let rawRowsResult = await executeActivitiesSelect({ includePreferences, includeTraits, includePlaceMetadata });
    let rawRows = rawRowsResult.data ?? null;

    for (let attempt = 0; rawRowsResult.error && attempt < 3; attempt += 1) {
      const message = rawRowsResult.error.message?.toLowerCase?.() ?? '';
      if (includePreferences && isMissingParticipantPreferenceRelationship(rawRowsResult.error)) {
        includePreferences = false;
      } else if (includeTraits && message.includes('does not exist')) {
        includeTraits = false;
      } else if (includePlaceMetadata && isMissingColumnError(rawRowsResult.error, 'place_id')) {
        includePlaceMetadata = false;
      } else {
        break;
      }

      rawRowsResult = await executeActivitiesSelect({ includePreferences, includeTraits, includePlaceMetadata });
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

    const activityIds = chosen.map((row) => row.id);
    const upcomingCounts: Record<string, number> = {};
    if (activityIds.length) {
      const nowIso = new Date().toISOString();
      const { data: upcomingRows, error: upcomingError } = await supabase
        .from('sessions')
        .select('activity_id')
        .in('activity_id', activityIds)
        .gte('starts_at', nowIso)
        .limit(5000)
        .returns<UpcomingSessionRow[]>();

      if (upcomingError) {
        // eslint-disable-next-line no-console
        console.warn('[nearby] failed to load upcoming session counts', upcomingError);
      } else if (upcomingRows) {
        for (const row of upcomingRows) {
          if (!row.activity_id) continue;
          upcomingCounts[row.activity_id] = (upcomingCounts[row.activity_id] ?? 0) + 1;
        }
      }
    }

    const mapRowToActivity = (row: (typeof chosen)[number]): PublicNearbyActivity => {
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
        place_id: row.place_id ?? null,
        place_label: null,
        lat: row.lat as number,
        lng: row.lng as number,
        distance_m: row.distance,
        activity_types: row.activity_types ?? null,
        tags: row.tags ?? null,
        traits: uniqueTraits.length ? uniqueTraits : null,
        upcoming_session_count: upcomingCounts[row.id] ?? 0,
      };
    };

    const mapFallbackActivity = (activity: PublicNearbyActivity): PublicNearbyActivity => ({
      id: activity.id,
      name: activity.name,
      venue: activity.venue,
      place_id: activity.place_id ?? null,
      place_label: activity.place_label,
      lat: activity.lat,
      lng: activity.lng,
      distance_m: activity.distance_m,
      activity_types: activity.activity_types ?? null,
      tags: activity.tags ?? null,
      traits: activity.traits ?? null,
      upcoming_session_count: 0,
    });

    let activitiesPayload: PublicNearbyActivity[] = chosen.map(mapRowToActivity);
    let fallbackMeta: { degraded?: boolean; fallbackError?: string; fallbackSource?: string } = {};

    if (activitiesPayload.length < fallbackLimit) {
      try {
        const fallbackResult = await respondWithOverpass(q, radiusMeters, fallbackLimit);
        if (fallbackResult.activities.length) {
          const combined = dedupeById([
            ...activitiesPayload,
            ...fallbackResult.activities.map(mapFallbackActivity),
          ]);
          activitiesPayload = combined.slice(0, fallbackLimit);
          if (fallbackResult.source === 'osm-overpass') {
            fallbackMeta.fallbackSource = 'osm-overpass';
          }
        }
      } catch (fallbackError) {
        console.warn('[nearby] fallback append failed', fallbackError);
        fallbackMeta = {
          degraded: true,
          fallbackError: getErrorMessage(fallbackError),
        };
        try {
          const venueFallback = await fetchVenueFallbackActivities(supabase, q, radiusMeters, fallbackLimit);
          if (venueFallback.length) {
            const combined = dedupeById([
              ...activitiesPayload,
              ...venueFallback.map(mapFallbackActivity),
            ]);
            activitiesPayload = combined.slice(0, fallbackLimit);
            fallbackMeta.fallbackSource = 'supabase-venues';
          }
        } catch (venueFallbackError) {
          console.warn('[nearby] venue fallback failed', venueFallbackError);
        }
        if (!activitiesPayload.length) {
          return Response.json({ error: getErrorMessage(fallbackError) }, { status: 500 });
        }
      }
    }

    const hydratedActivities = await hydrateActivitiesWithPlaces(supabase, activitiesPayload);
    const source = hydratedActivities.length === 0
      ? (fallbackMeta.degraded ? 'degraded' : 'empty')
      : fallbackMeta.fallbackSource ?? 'client-filter';

    return Response.json({
      center: { lat: q.lat, lng: q.lng },
      radiusMeters,
      count: hydratedActivities.length,
      activities: hydratedActivities,
      source,
      ...fallbackMeta,
    });
  } catch (error: unknown) {
    console.error('Nearby error', error);
    try {
      const fallback = await respondWithOverpass(q, radiusMeters, fallbackLimit);
      return Response.json({ ...fallback, degraded: true, fallbackError: getErrorMessage(error) });
    } catch (fallbackError) {
      console.warn('[nearby] overpass degraded fallback failed', fallbackError);
      try {
        const venueFallback = await fetchVenueFallbackActivities(db(), q, radiusMeters, fallbackLimit);
        return Response.json({
          center: { lat: q.lat, lng: q.lng },
          radiusMeters,
          count: venueFallback.length,
          activities: venueFallback,
          source: venueFallback.length ? 'supabase-venues' : 'empty',
          degraded: true,
          fallbackError: getErrorMessage(error),
          fallbackSource: 'supabase-venues',
        });
      } catch (venueFallbackError) {
        console.error('[nearby] venue degraded fallback failed', venueFallbackError);
        const payload: ErrorPayload = { error: getErrorMessage(error) };
        return Response.json(payload, { status: 500 });
      }
    }
  }
}
