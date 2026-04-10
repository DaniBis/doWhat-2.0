import {
  describeEventDiscoveryPresentation,
  inferEventLocationKind,
  inferEventOriginKind,
  inferEventParticipationTruth,
  type EventSummary,
} from '@dowhat/shared';

import { PLACE_FALLBACK_LABEL, normalizePlaceLabel } from '@/lib/places/labels';

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
  if (event && inferEventOriginKind(event) === 'session') {
    return {
      label: 'Community session',
      helper:
        inferEventLocationKind(event) === 'canonical_place'
          ? 'Created on doWhat at a confirmed place'
          : 'Created on doWhat',
    };
  }

  const summary = describeEventDiscoveryPresentation(event);
  return { label: summary.badgeLabel, helper: summary.helper };
};

export const describeEventPrimaryAction = (
  event: EventSummary | null | undefined,
): { label: string; secondaryLabel: string | null } => {
  const summary = describeEventDiscoveryPresentation(event);
  return {
    label: summary.primaryActionLabel,
    secondaryLabel: summary.secondaryActionLabel,
  };
};

export const describeEventParticipation = (
  event: EventSummary | null | undefined,
): { label: string; helper: string } => {
  if (!event) {
    return {
      label: 'Attendance unavailable',
      helper: 'Attendance details are not available for this listing yet.',
    };
  }

  const participation = inferEventParticipationTruth(event);
  if (participation.participation_truth_level === 'linked_first_party') {
    return {
      label: 'Session-managed attendance',
      helper: 'doWhat manages RSVPs and attendance on the linked session page.',
    };
  }
  if (participation.participation_truth_level === 'external_source') {
    return {
      label: 'Source-managed attendance',
      helper: 'RSVPs and attendance stay on the original event source.',
    };
  }
  if (participation.participation_truth_level === 'first_party') {
    return {
      label: 'doWhat attendance',
      helper: 'doWhat manages RSVPs and attendance for this event.',
    };
  }
  return {
    label: 'Attendance unavailable',
    helper: 'This listing does not expose a doWhat RSVP or attendance flow.',
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
  const fallback =
    options?.fallback === undefined
      ? (
        event
          ? inferEventLocationKind(event) === 'flexible'
            ? 'Location to be confirmed'
            : inferEventLocationKind(event) === 'custom_location'
              ? 'Pinned meetup point'
              : PLACE_FALLBACK_LABEL
          : PLACE_FALLBACK_LABEL
      )
      : options.fallback;
  if (!event) return fallback ?? null;
  const label = normalizePlaceLabel(event.place?.name ?? null, event.place_label, event.venue_name, event.address);
  if (label === PLACE_FALLBACK_LABEL && fallback && fallback !== PLACE_FALLBACK_LABEL) {
    return fallback;
  }
  return label ?? fallback ?? null;
};

export type { EventVerificationProgress } from '@dowhat/shared';
export { buildEventVerificationProgress } from '@dowhat/shared';
