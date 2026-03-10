import type { DiscoveryFilterContract, DiscoveryTrustMode } from '../discovery';

export type CapacityFilterKey = 'any' | 'couple' | 'small' | 'medium' | 'large';
export type TimeWindowKey = 'any' | 'open_now' | 'morning' | 'afternoon' | 'evening' | 'late';

export type MapFilterPreferences = {
  activityTypes: string[];
  traits: string[];
  taxonomyCategories: string[];
  priceLevels: number[];
  capacityKey: CapacityFilterKey;
  timeWindow: TimeWindowKey;
  trustMode: DiscoveryTrustMode;
};

export const DEFAULT_MAP_FILTER_PREFERENCES: MapFilterPreferences = {
  activityTypes: [],
  traits: [],
  taxonomyCategories: [],
  priceLevels: [],
  capacityKey: 'any',
  timeWindow: 'any',
  trustMode: 'all',
};

const normaliseList = (values: string[] | null | undefined): string[] => {
  if (!values || !values.length) return [];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const normaliseNumberList = (values: number[] | null | undefined): number[] => {
  if (!values || !values.length) return [];
  const cleaned = values
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null))
    .filter((value): value is number => value != null)
    .filter((value) => value >= 1 && value <= 4);
  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
};

const CAPACITY_KEYS = new Set<CapacityFilterKey>(['any', 'couple', 'small', 'medium', 'large']);
const TIME_WINDOW_KEYS = new Set<TimeWindowKey>(['any', 'open_now', 'morning', 'afternoon', 'evening', 'late']);
const TRUST_MODES = new Set<DiscoveryTrustMode>(['all', 'verified_only', 'ai_only']);

const normaliseCapacityKey = (value: string | null | undefined): CapacityFilterKey =>
  CAPACITY_KEYS.has(value as CapacityFilterKey) ? (value as CapacityFilterKey) : 'any';

const normaliseTimeWindow = (value: string | null | undefined): TimeWindowKey =>
  TIME_WINDOW_KEYS.has(value as TimeWindowKey) ? (value as TimeWindowKey) : 'any';

const normaliseTrustMode = (value: string | null | undefined): DiscoveryTrustMode =>
  TRUST_MODES.has(value as DiscoveryTrustMode) ? (value as DiscoveryTrustMode) : 'all';

export const normaliseMapFilterPreferences = (
  prefs: MapFilterPreferences | null | undefined,
): MapFilterPreferences => {
  const source = prefs ?? DEFAULT_MAP_FILTER_PREFERENCES;
  return {
    activityTypes: normaliseList(source.activityTypes),
    traits: normaliseList(source.traits),
    taxonomyCategories: normaliseList(source.taxonomyCategories),
    priceLevels: normaliseNumberList(source.priceLevels),
    capacityKey: normaliseCapacityKey(source.capacityKey),
    timeWindow: normaliseTimeWindow(source.timeWindow),
    trustMode: normaliseTrustMode(source.trustMode),
  };
};

export const mapPreferencesToQueryFilters = (
  prefs: MapFilterPreferences,
): DiscoveryFilterContract | undefined => {
  const {
    activityTypes,
    traits,
    taxonomyCategories,
    priceLevels,
    capacityKey,
    timeWindow,
    trustMode,
  } = normaliseMapFilterPreferences(prefs);
  const filters: DiscoveryFilterContract = {};
  if (activityTypes.length) filters.activityTypes = activityTypes;
  if (traits.length) filters.peopleTraits = traits;
  if (taxonomyCategories.length) filters.taxonomyCategories = taxonomyCategories;
  if (priceLevels.length) filters.priceLevels = priceLevels;
  if (capacityKey !== 'any') filters.capacityKey = capacityKey;
  if (timeWindow !== 'any') filters.timeWindow = timeWindow;
  if (trustMode !== 'all') filters.trustMode = trustMode;
  return Object.keys(filters).length ? filters : undefined;
};
