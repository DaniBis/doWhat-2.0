export type NearbyQuery = {
  lat: number
  lng: number
  radiusMeters?: number
  activityTypes?: string[]
  tags?: string[]
  peopleTraits?: string[]
  limit?: number
};

export function parseNearbyQuery(searchParams: URLSearchParams): NearbyQuery {
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const radiusMeters = parseInt(searchParams.get('radius') || '2000');
  const activityTypes = (searchParams.get('types') || '').split(',').filter(Boolean);
  const tags = (searchParams.get('tags') || '').split(',').filter(Boolean);
  const peopleTraits = (searchParams.get('traits') || '').split(',').filter(Boolean);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  return { lat, lng, radiusMeters, activityTypes, tags, peopleTraits, limit };
}

