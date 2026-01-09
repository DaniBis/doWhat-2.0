export const PLACE_FALLBACK_LABEL = 'Unnamed spot';

export const normalizePlaceLabel = (
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return PLACE_FALLBACK_LABEL;
};

export type PlaceLabelInput = {
  place?: { name?: string | null } | null;
  venue_name?: string | null;
  venue?: string | null;
  address?: string | null;
  fallbackLabel?: string | null;
};

export const hydratePlaceLabel = (input: PlaceLabelInput): string =>
  normalizePlaceLabel(
    input.place?.name ?? null,
    input.venue_name ?? null,
    input.venue ?? null,
    input.address ?? null,
    input.fallbackLabel ?? null,
  );
