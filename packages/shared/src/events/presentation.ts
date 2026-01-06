import type { EventSummary } from './types';

export type EventVerificationProgress = {
  confirmations: number;
  required: number;
  percent: number;
  complete: boolean;
};

export const buildEventVerificationProgress = (
  event: EventSummary | null | undefined,
): EventVerificationProgress | null => {
  if (!event) return null;
  const confirmations =
    typeof event.verification_confirmations === 'number'
      ? Math.max(0, event.verification_confirmations)
      : null;
  const requiredRaw =
    typeof event.verification_required === 'number' ? event.verification_required : null;
  if (confirmations == null || requiredRaw == null || requiredRaw <= 0) {
    return null;
  }
  const required = Math.max(1, requiredRaw);
  const percent = Math.max(0, Math.min(100, Math.round((confirmations / required) * 100)));
  return {
    confirmations,
    required,
    percent,
    complete: confirmations >= required,
  };
};
