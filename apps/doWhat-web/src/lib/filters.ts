export type NearbyQuery = {
  lat: number
  lng: number
  radiusMeters?: number
  refresh?: boolean
  activityTypes?: string[]
  tags?: string[]
  traits?: string[]
  taxonomyCategories?: string[]
  priceLevels?: number[]
  capacityKey?: string | null
  timeWindow?: string | null
  limit?: number
};

export function parseNearbyQuery(searchParams: URLSearchParams): NearbyQuery {
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const radiusMeters = parseInt(searchParams.get('radius') || '2000');
  const refresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';
  const activityTypes = (searchParams.get('types') || '').split(',').filter(Boolean);
  const tags = (searchParams.get('tags') || '').split(',').filter(Boolean);
  const traits = (searchParams.get('traits') || '').split(',').filter(Boolean);
  const taxonomyCategories = (searchParams.get('taxonomy') || '').split(',').filter(Boolean);
  const priceLevels = (searchParams.get('prices') || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value))
    .filter((value) => value >= 1 && value <= 4);
  const capacityKey = searchParams.get('capacity') || null;
  const timeWindow = searchParams.get('timeWindow') || null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  return {
    lat,
    lng,
    radiusMeters,
    refresh,
    activityTypes,
    tags,
    traits,
    taxonomyCategories,
    priceLevels,
    capacityKey,
    timeWindow,
    limit,
  };
}
