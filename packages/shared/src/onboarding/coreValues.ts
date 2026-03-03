export const CORE_VALUES_REQUIRED_COUNT = 3;
export const CORE_VALUE_MAX_LENGTH = 48;

const cleanValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > CORE_VALUE_MAX_LENGTH) {
    return trimmed.slice(0, CORE_VALUE_MAX_LENGTH);
  }
  return trimmed;
};

export const normalizeCoreValues = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const deduped = new Set<string>();
  const cleaned: string[] = [];

  values.forEach((value) => {
    const normalized = cleanValue(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (deduped.has(key)) return;
    deduped.add(key);
    cleaned.push(normalized);
  });

  return cleaned.slice(0, CORE_VALUES_REQUIRED_COUNT);
};

export const hasRequiredCoreValues = (values: unknown): boolean =>
  normalizeCoreValues(values).length >= CORE_VALUES_REQUIRED_COUNT;
