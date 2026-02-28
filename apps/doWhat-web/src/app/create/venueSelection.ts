import { isUuid } from '@dowhat/shared';

export const parseVenueSelection = (value: string): { venueId: string; placeId: string } => {
  const trimmed = value.trim();
  if (!trimmed) return { venueId: '', placeId: '' };
  if (trimmed.startsWith('place:')) {
    const id = trimmed.slice('place:'.length);
    return { venueId: '', placeId: isUuid(id) ? id : '' };
  }
  if (trimmed.startsWith('venue:')) {
    const id = trimmed.slice('venue:'.length);
    return { venueId: isUuid(id) ? id : '', placeId: '' };
  }
  if (isUuid(trimmed)) {
    return { venueId: trimmed, placeId: '' };
  }
  return { venueId: '', placeId: '' };
};
