import {
  parseDiscoveryFilterContractSearchParams,
  type NormalizedDiscoveryFilterContract,
} from '@dowhat/shared';

export type NearbyQuery = {
  lat: number
  lng: number
  radiusMeters?: number
  refresh?: boolean
  explain?: boolean
  debug?: boolean
  limit?: number
  filters: NormalizedDiscoveryFilterContract
};

const MAX_NEARBY_LIMIT = 2000;

export function parseNearbyQuery(searchParams: URLSearchParams): NearbyQuery {
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const radiusMeters = parseInt(searchParams.get('radius') || '2000');
  const refresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';
  const explain = searchParams.get('explain') === '1' || searchParams.get('explain') === 'true';
  const debug = searchParams.get('debug') === '1' || searchParams.get('debug') === 'true';
  const requestedLimit = parseInt(searchParams.get('limit') || '50');
  const safeLimit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  const limit = Math.min(Math.max(safeLimit, 1), MAX_NEARBY_LIMIT);
  const filters = parseDiscoveryFilterContractSearchParams(searchParams);
  return {
    lat,
    lng,
    radiusMeters,
    refresh,
    explain,
    debug,
    limit,
    filters,
  };
}
