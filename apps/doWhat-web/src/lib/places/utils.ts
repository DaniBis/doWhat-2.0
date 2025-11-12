import type { PlaceProvider, ProviderPlace } from './types';

const DEG_TO_RAD = Math.PI / 180;

export const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(st)\.?\b/g, 'street')
    .replace(/\b(rd)\.?\b/g, 'road')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = (value: string): Set<string> => {
  const tokens = normalizeName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
  return new Set(tokens);
};

export const nameSimilarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a.toLowerCase() === b.toLowerCase()) return 1;
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const denominator = Math.max(setA.size, setB.size, 1);
  return intersection / denominator;
};

const jaroDistance = (s1: string, s2: string): number => {
  const str1 = s1.trim().toLowerCase();
  const str2 = s2.trim().toLowerCase();
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const matchDistance = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array(str1.length).fill(false);
  const str2Matches = new Array(str2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < str1.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, str2.length);
    for (let j = start; j < end; j += 1) {
      if (str2Matches[j]) continue;
      if (str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < str1.length; i += 1) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) {
      k += 1;
    }
    if (str1[i] !== str2[k]) transpositions += 1;
    k += 1;
  }

  const jaro =
    (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;
  return jaro;
};

export const jaroWinklerSimilarity = (a: string, b: string): number => {
  const jaro = jaroDistance(a, b);
  if (jaro <= 0.7) return jaro;

  let prefix = 0;
  const maxPrefix = 4;
  const str1 = a.trim().toLowerCase();
  const str2 = b.trim().toLowerCase();
  for (let i = 0; i < Math.min(maxPrefix, str1.length, str2.length); i += 1) {
    if (str1[i] === str2[i]) {
      prefix += 1;
    } else {
      break;
    }
  }

  return Math.min(jaro + prefix * 0.1 * (1 - jaro), 1);
};

export const randomCacheExpiry = (baseDays = 21, varianceDays = 9): Date => {
  const extra = Math.random() * varianceDays;
  const targetDays = baseDays + extra;
  const targetMs = targetDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + targetMs);
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');

export const slugFromNameAndCoords = (name: string, lat: number, lng: number): string => {
  const base = slugify(name);
  const latPart = Math.round(Math.abs(lat) * 1000).toString(36);
  const lngPart = Math.round(Math.abs(lng) * 1000).toString(36);
  return `${base}-${latPart}${lngPart}`.replace(/^-+|-+$/g, '');
};

export const ensureArray = <T>(value: T[] | T | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

export const mergeCategories = (...categoryLists: (string[] | undefined)[]): string[] => {
  const set = new Set<string>();
  categoryLists.forEach((list) => {
    (list ?? []).forEach((item) => {
      const normalized = item.trim().toLowerCase();
      if (normalized) set.add(normalized);
    });
  });
  return Array.from(set);
};

export const mergeProviders = (...providers: (PlaceProvider | undefined | null)[]): PlaceProvider[] => {
  const set = new Set<PlaceProvider>();
  providers.forEach((provider) => {
    if (provider) set.add(provider);
  });
  return Array.from(set);
};

export const defaultAttribution = (provider: PlaceProvider): { text: string; url?: string; license?: string } => {
  switch (provider) {
    case 'openstreetmap':
      return {
        text: '© OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL',
      };
    case 'foursquare':
      return {
        text: 'Data from Foursquare Places',
        url: 'https://location.foursquare.com/developer/places-api',
      };
    case 'google_places':
      return {
        text: 'Google Places',
        url: 'https://developers.google.com/maps/documentation/places/web-service/policies',
      };
    default:
      return { text: provider };
  }
};

export const summariseProviderCounts = (items: ProviderPlace[]): Record<PlaceProvider, number> => {
  const result: Record<PlaceProvider, number> = {
    openstreetmap: 0,
    foursquare: 0,
    google_places: 0,
  };
  items.forEach((item) => {
    result[item.provider] = (result[item.provider] ?? 0) + 1;
  });
  return result;
};
