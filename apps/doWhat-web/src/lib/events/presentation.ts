import type { EventSummary } from '@dowhat/shared';

import { PLACE_FALLBACK_LABEL, normalizePlaceLabel } from '@/lib/places/labels';

const eventMetadata = (event: EventSummary | null | undefined): Record<string, unknown> | null => {
  if (!event || !event.metadata || typeof event.metadata !== 'object') {
    return null;
  }
  return event.metadata as Record<string, unknown>;
};

export const describeEventState = (state?: EventSummary['event_state'] | null): string =>
  state === 'canceled' ? 'Cancelled' : 'Scheduled';

export const describeEventVerification = (status: EventSummary['status']): string => {
  if (status === 'verified') return 'Verified';
  if (status === 'rejected') return 'Rejected';
  return 'Unverified';
};

export const eventVerificationClass = (status: EventSummary['status']): string => {
  if (status === 'verified') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected') return 'border-feedback-danger/40 bg-feedback-danger/10 text-feedback-danger';
  return 'border-midnight-border/30 bg-surface-alt text-ink-medium';
};

export const eventStateClass = (state?: EventSummary['event_state'] | null): string =>
  state === 'canceled'
    ? 'border-feedback-danger/40 bg-feedback-danger/10 text-feedback-danger'
    : 'border-brand-teal/30 bg-brand-teal/10 text-brand-teal';

export const describeEventOrigin = (
  event: EventSummary | null | undefined,
): { label: string; helper: string } => {
  const metadata = eventMetadata(event);
  const source = typeof metadata?.source === 'string' ? metadata.source : null;
  const hasSessionId = metadata?.sessionId || metadata?.session_id;
  if (source === 'session' || typeof hasSessionId === 'string') {
    return {
      label: 'Community activity',
      helper: 'Hosted on doWhat',
    };
  }
  return {
    label: 'Open event',
    helper: 'Community-created listing',
  };
};

export const clampReliabilityScore = (score?: number | null): number | null => {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

export const reliabilityBarClass = (score: number | null): string => {
  if (score == null) return 'bg-midnight-border/40';
  if (score >= 80) return 'bg-brand-teal';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-feedback-danger';
};

export const describeReliabilityConfidence = (score: number | null): string => {
  if (score == null) return 'Awaiting reliability data';
  if (score >= 80) return 'High confidence';
  if (score >= 50) return 'Community signal';
  return 'Needs confirmations';
};

export const formatReliabilityLabel = (score: number | null): string => {
  if (score == null) return 'New event';
  return `${score}% trusted`;
};

export const eventPlaceLabel = (
  event: EventSummary | null | undefined,
  options?: { fallback?: string | null },
): string | null => {
  const fallback = options?.fallback === undefined ? PLACE_FALLBACK_LABEL : options.fallback;
  if (!event) return fallback ?? null;
  const label = normalizePlaceLabel(event.place_label, event.venue_name, event.address);
  if (label === PLACE_FALLBACK_LABEL && fallback && fallback !== PLACE_FALLBACK_LABEL) {
    return fallback;
  }
  return label ?? fallback ?? null;
};

export type { EventVerificationProgress } from '@dowhat/shared';
export { buildEventVerificationProgress } from '@dowhat/shared';
