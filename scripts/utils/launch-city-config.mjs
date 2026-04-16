export const LAUNCH_CITY_CONFIG = {
  hanoi: {
    slug: 'hanoi',
    label: 'Hanoi',
    canonicalCity: 'Hanoi',
    bbox: {
      sw: { lat: 20.86, lng: 105.62 },
      ne: { lat: 21.26, lng: 106.1 },
    },
    aliases: ['hanoi', 'ha noi', 'hà nội', 'hanoi, vietnam', 'ha noi, vietnam', 'hà nội, việt nam'],
  },
  bangkok: {
    slug: 'bangkok',
    label: 'Bangkok',
    canonicalCity: 'Bangkok',
    bbox: {
      sw: { lat: 13.48, lng: 100.24 },
      ne: { lat: 14.06, lng: 100.95 },
    },
    aliases: ['bangkok', 'bangkok, thailand', 'krung thep', 'krung thep maha nakhon', 'กรุงเทพ', 'กรุงเทพมหานคร'],
  },
  danang: {
    slug: 'danang',
    label: 'Da Nang',
    canonicalCity: 'Da Nang',
    bbox: {
      sw: { lat: 15.95, lng: 108.06 },
      ne: { lat: 16.2, lng: 108.33 },
    },
    aliases: ['danang', 'da nang', 'da nang, vietnam', 'đà nẵng', 'đà nẵng, việt nam', 'da nang city', 'đà nẵng city'],
  },
};

export const normalizeScopeValue = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

export const resolveLaunchCityKey = (value) => {
  const normalized = normalizeScopeValue(value);
  if (!normalized) return null;
  return (
    Object.keys(LAUNCH_CITY_CONFIG).find((city) => {
      const config = LAUNCH_CITY_CONFIG[city];
      return config.aliases.map(normalizeScopeValue).includes(normalized) || normalizeScopeValue(city) === normalized;
    }) ?? null
  );
};

export const matchesLegacyCityStringScope = (place, cityKey) => {
  const token = LAUNCH_CITY_CONFIG[cityKey]?.slug ?? cityKey;
  const haystacks = [place.city, place.locality]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.toLowerCase());
  return haystacks.some((value) => value.includes(token));
};

export const matchesLaunchCityAliasScope = (place, cityKey) => {
  const aliases = LAUNCH_CITY_CONFIG[cityKey]?.aliases ?? [cityKey];
  const normalizedAliases = new Set(aliases.map(normalizeScopeValue));
  return [place.city, place.locality]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => normalizeScopeValue(value))
    .some((value) => normalizedAliases.has(value));
};

export const isWithinLaunchCityBbox = (place, cityKey) => {
  const config = LAUNCH_CITY_CONFIG[cityKey];
  if (!config) return false;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= config.bbox.sw.lat
    && lat <= config.bbox.ne.lat
    && lng >= config.bbox.sw.lng
    && lng <= config.bbox.ne.lng;
};

export const matchesCurrentLaunchCityScope = (place, cityKey) =>
  isWithinLaunchCityBbox(place, cityKey)
  || matchesLaunchCityAliasScope(place, cityKey);
