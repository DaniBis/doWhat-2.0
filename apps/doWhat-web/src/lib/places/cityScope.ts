import { listCities, type CityConfig } from '@dowhat/shared';

type Coordinate = { lat: number; lng: number };

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};

export const normalizeCityScopeValue = (value: string | null | undefined): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const buildAliasSet = (city: CityConfig): Set<string> =>
  new Set([city.slug, city.name, ...city.scopeAliases].map(normalizeCityScopeValue).filter(Boolean));

export const resolveCityScope = (value: string | null | undefined): CityConfig | null => {
  const normalized = normalizeCityScopeValue(value);
  if (!normalized) return null;
  return listCities().find((city) => buildAliasSet(city).has(normalized)) ?? null;
};

export const isWithinCityBbox = (coordinate: Coordinate, city: CityConfig): boolean =>
  coordinate.lat >= city.bbox.sw.lat
  && coordinate.lat <= city.bbox.ne.lat
  && coordinate.lng >= city.bbox.sw.lng
  && coordinate.lng <= city.bbox.ne.lng;

export const resolveCityScopeForCoordinate = (coordinate: Coordinate): CityConfig | null =>
  listCities().find((city) => isWithinCityBbox(coordinate, city)) ?? null;

export const canonicalizeKnownCityFields = (input: {
  lat: number;
  lng: number;
  city: string | null | undefined;
  locality: string | null | undefined;
}): { city: string | null; locality: string | null; matchedCitySlug: string | null } => {
  const coordinateScope = resolveCityScopeForCoordinate({ lat: input.lat, lng: input.lng });
  const textScope = resolveCityScope(input.city) ?? resolveCityScope(input.locality);
  const scope = coordinateScope ?? textScope;

  const currentCity = normalizeText(input.city);
  const currentLocality = normalizeText(input.locality);
  if (!scope) {
    return {
      city: currentCity,
      locality: currentLocality,
      matchedCitySlug: null,
    };
  }

  const aliasSet = buildAliasSet(scope);
  const cityMatchesScope = currentCity ? aliasSet.has(normalizeCityScopeValue(currentCity)) : false;
  const localityMatchesScope = currentLocality ? aliasSet.has(normalizeCityScopeValue(currentLocality)) : false;

  let nextLocality = currentLocality;
  if (!nextLocality && currentCity && !cityMatchesScope) {
    nextLocality = currentCity;
  }
  if (nextLocality && aliasSet.has(normalizeCityScopeValue(nextLocality))) {
    nextLocality = null;
  }
  if (!nextLocality && currentLocality && !localityMatchesScope) {
    nextLocality = currentLocality;
  }

  return {
    city: scope.name,
    locality: nextLocality,
    matchedCitySlug: scope.slug,
  };
};
