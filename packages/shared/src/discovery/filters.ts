import type { CapacityFilterKey, TimeWindowKey } from '../preferences/mapFilters';
import { stripHospitalityFirstDiscoverySelections } from './activityBoundary';

export const DISCOVERY_RESULT_KINDS = ['activities', 'events', 'places'] as const;
export type DiscoveryResultKind = (typeof DISCOVERY_RESULT_KINDS)[number];

export const DISCOVERY_SORT_MODES = ['rank', 'distance', 'name', 'soonest'] as const;
export type DiscoverySortMode = (typeof DISCOVERY_SORT_MODES)[number];

export const DISCOVERY_TRUST_MODES = ['all', 'verified_only', 'ai_only'] as const;
export type DiscoveryTrustMode = (typeof DISCOVERY_TRUST_MODES)[number];

export interface DiscoveryFilterContract {
  resultKinds?: DiscoveryResultKind[];
  searchText?: string;
  activityTypes?: string[];
  tags?: string[];
  taxonomyCategories?: string[];
  priceLevels?: number[];
  capacityKey?: CapacityFilterKey;
  timeWindow?: TimeWindowKey;
  maxDistanceKm?: number | null;
  peopleTraits?: string[];
  trustMode?: DiscoveryTrustMode;
  sortMode?: DiscoverySortMode;
}

export interface NormalizedDiscoveryFilterContract {
  resultKinds: DiscoveryResultKind[];
  searchText: string;
  activityTypes: string[];
  tags: string[];
  taxonomyCategories: string[];
  priceLevels: number[];
  capacityKey: CapacityFilterKey;
  timeWindow: TimeWindowKey;
  maxDistanceKm: number | null;
  peopleTraits: string[];
  trustMode: DiscoveryTrustMode;
  sortMode: DiscoverySortMode;
}

const CAPACITY_KEYS = new Set<CapacityFilterKey>(['any', 'couple', 'small', 'medium', 'large']);
const TIME_WINDOW_KEYS = new Set<TimeWindowKey>(['any', 'open_now', 'morning', 'afternoon', 'evening', 'late']);
const RESULT_KIND_ORDER = new Map<DiscoveryResultKind, number>(DISCOVERY_RESULT_KINDS.map((value, index) => [value, index]));
const SORT_MODE_SET = new Set<DiscoverySortMode>(DISCOVERY_SORT_MODES);
const TRUST_MODE_SET = new Set<DiscoveryTrustMode>(DISCOVERY_TRUST_MODES);

const splitCommaValues = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const readCommaList = (params: URLSearchParams, key: string): string[] => {
  const values = params.getAll(key);
  if (!values.length) {
    const single = params.get(key);
    return single ? splitCommaValues(single) : [];
  }
  return values.flatMap(splitCommaValues);
};

const normalizeStringArray = (value?: readonly (string | null | undefined)[] | null): string[] => {
  if (!value?.length) return [];
  const cleaned = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).sort((left, right) => left.localeCompare(right));
};

const normalizeDiscoverySelectionArray = (value?: readonly (string | null | undefined)[] | null): string[] =>
  stripHospitalityFirstDiscoverySelections(normalizeStringArray(value));

const normalizeNumberArray = (value?: readonly (number | null | undefined)[] | null): number[] => {
  if (!value?.length) return [];
  const cleaned = value
    .map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? Math.round(entry) : null))
    .filter((entry): entry is number => entry != null)
    .filter((entry) => entry >= 1 && entry <= 4);
  return Array.from(new Set(cleaned)).sort((left, right) => left - right);
};

const normalizeCapacityKey = (value: unknown): CapacityFilterKey =>
  CAPACITY_KEYS.has(value as CapacityFilterKey) ? (value as CapacityFilterKey) : 'any';

const normalizeTimeWindow = (value: unknown): TimeWindowKey =>
  TIME_WINDOW_KEYS.has(value as TimeWindowKey) ? (value as TimeWindowKey) : 'any';

const normalizeResultKinds = (value?: readonly (string | null | undefined)[] | null): DiscoveryResultKind[] => {
  if (!value?.length) return [];
  const filtered = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry): entry is DiscoveryResultKind => RESULT_KIND_ORDER.has(entry as DiscoveryResultKind));
  return Array.from(new Set(filtered)).sort((left, right) => {
    return (RESULT_KIND_ORDER.get(left) ?? 0) - (RESULT_KIND_ORDER.get(right) ?? 0);
  });
};

const normalizeSearchText = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

const normalizeDistanceKm = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Number(value.toFixed(2));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Number(parsed.toFixed(2));
    }
  }
  return null;
};

const normalizeTrustMode = (value: unknown): DiscoveryTrustMode =>
  TRUST_MODE_SET.has(value as DiscoveryTrustMode) ? (value as DiscoveryTrustMode) : 'all';

const normalizeSortMode = (value: unknown): DiscoverySortMode =>
  SORT_MODE_SET.has(value as DiscoverySortMode) ? (value as DiscoverySortMode) : 'rank';

const parseBoolean = (value: string | null): boolean =>
  value === '1' || value === 'true';

export const normalizeDiscoveryFilterContract = (
  filters?: DiscoveryFilterContract | null,
): NormalizedDiscoveryFilterContract => ({
  resultKinds: normalizeResultKinds(filters?.resultKinds ?? null),
  searchText: normalizeSearchText(filters?.searchText),
  activityTypes: normalizeDiscoverySelectionArray(filters?.activityTypes ?? null),
  tags: normalizeDiscoverySelectionArray(filters?.tags ?? null),
  taxonomyCategories: normalizeDiscoverySelectionArray(filters?.taxonomyCategories ?? null),
  priceLevels: normalizeNumberArray(filters?.priceLevels ?? null),
  capacityKey: normalizeCapacityKey(filters?.capacityKey),
  timeWindow: normalizeTimeWindow(filters?.timeWindow),
  maxDistanceKm: normalizeDistanceKm(filters?.maxDistanceKm),
  peopleTraits: normalizeStringArray(filters?.peopleTraits ?? null),
  trustMode: normalizeTrustMode(filters?.trustMode),
  sortMode: normalizeSortMode(filters?.sortMode),
});

export const parseDiscoveryFilterContractSearchParams = (
  input: URLSearchParams | URL | string,
): NormalizedDiscoveryFilterContract => {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input)
      : input instanceof URL
        ? input.searchParams
        : input;

  const trustParam = params.get('trust');
  const verifiedOnly = parseBoolean(params.get('verifiedOnly'));
  const aiOnly = parseBoolean(params.get('aiOnly')) || parseBoolean(params.get('ai_only'));
  const trustMode = trustParam
    ? trustParam
    : verifiedOnly
      ? 'verified_only'
      : aiOnly
        ? 'ai_only'
        : 'all';

  return normalizeDiscoveryFilterContract({
    resultKinds: readCommaList(params, 'kind') as DiscoveryResultKind[],
    searchText: params.get('q') ?? params.get('search') ?? '',
    activityTypes: readCommaList(params, 'types'),
    tags: readCommaList(params, 'tags'),
    taxonomyCategories: readCommaList(params, 'taxonomy'),
    priceLevels: readCommaList(params, 'prices').map((entry) => Number(entry)),
    capacityKey: (params.get('capacity') ?? undefined) as CapacityFilterKey | undefined,
    timeWindow: (params.get('timeWindow') ?? undefined) as TimeWindowKey | undefined,
    maxDistanceKm: params.get('distanceKm') != null ? Number(params.get('distanceKm')) : undefined,
    peopleTraits: readCommaList(params, 'traits'),
    trustMode: trustMode as DiscoveryTrustMode,
    sortMode: (params.get('sort') ?? undefined) as DiscoverySortMode | undefined,
  });
};

export const serializeDiscoveryFilterContractToSearchParams = (
  filters?: DiscoveryFilterContract | NormalizedDiscoveryFilterContract | null,
): URLSearchParams => {
  const params = new URLSearchParams();
  const normalized = normalizeDiscoveryFilterContract(filters);

  if (normalized.resultKinds.length) params.set('kind', normalized.resultKinds.join(','));
  if (normalized.searchText) params.set('q', normalized.searchText);
  if (normalized.activityTypes.length) params.set('types', normalized.activityTypes.join(','));
  if (normalized.tags.length) params.set('tags', normalized.tags.join(','));
  if (normalized.peopleTraits.length) params.set('traits', normalized.peopleTraits.join(','));
  if (normalized.taxonomyCategories.length) params.set('taxonomy', normalized.taxonomyCategories.join(','));
  if (normalized.priceLevels.length) params.set('prices', normalized.priceLevels.join(','));
  if (normalized.capacityKey !== 'any') params.set('capacity', normalized.capacityKey);
  if (normalized.timeWindow !== 'any') params.set('timeWindow', normalized.timeWindow);
  if (normalized.maxDistanceKm != null) params.set('distanceKm', String(normalized.maxDistanceKm));
  if (normalized.trustMode !== 'all') params.set('trust', normalized.trustMode);
  if (normalized.sortMode !== 'rank') params.set('sort', normalized.sortMode);

  return params;
};

export const discoveryFilterContractsEqual = (
  left?: DiscoveryFilterContract | null,
  right?: DiscoveryFilterContract | null,
): boolean => {
  return JSON.stringify(normalizeDiscoveryFilterContract(left)) === JSON.stringify(normalizeDiscoveryFilterContract(right));
};

export const countActiveDiscoveryFilters = (
  filters?: DiscoveryFilterContract | NormalizedDiscoveryFilterContract | null,
): number => {
  const normalized = normalizeDiscoveryFilterContract(filters);
  let count = 0;
  if (normalized.resultKinds.length) count += 1;
  if (normalized.searchText) count += 1;
  if (normalized.activityTypes.length) count += 1;
  if (normalized.tags.length) count += 1;
  if (normalized.taxonomyCategories.length) count += 1;
  if (normalized.priceLevels.length) count += 1;
  if (normalized.capacityKey !== 'any') count += 1;
  if (normalized.timeWindow !== 'any') count += 1;
  if (normalized.maxDistanceKm != null) count += 1;
  if (normalized.peopleTraits.length) count += 1;
  if (normalized.trustMode !== 'all') count += 1;
  if (normalized.sortMode !== 'rank') count += 1;
  return count;
};

export const hasActiveDiscoveryFilters = (
  filters?: DiscoveryFilterContract | NormalizedDiscoveryFilterContract | null,
): boolean => countActiveDiscoveryFilters(filters) > 0;

export const mergeLegacyCategoriesIntoDiscoveryFilters = (
  filters: DiscoveryFilterContract | NormalizedDiscoveryFilterContract | null | undefined,
  categories?: readonly string[] | null,
): NormalizedDiscoveryFilterContract => {
  const normalized = normalizeDiscoveryFilterContract(filters);
  if (!categories?.length) return normalized;
  return normalizeDiscoveryFilterContract({
    ...normalized,
    taxonomyCategories: [...normalized.taxonomyCategories, ...categories],
  });
};
