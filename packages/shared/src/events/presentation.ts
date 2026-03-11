import type { EventSummary } from './types';
import {
  inferEventDiscoveryKind,
  inferEventLocationKind,
  inferEventParticipationTruth,
} from './truth';

export type EventDiscoveryPresentation = {
  badgeLabel: string;
  helper: string;
  primaryActionLabel: 'View session' | 'View event';
  primaryActionKind: 'view_session' | 'view_event';
  secondaryActionLabel: 'View source' | null;
};

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

const hasExternalSourceLink = (event: EventSummary | null | undefined): boolean => {
  if (!event) return false;
  const metadata = event.metadata;
  const sourceUrl =
    metadata && typeof metadata === 'object' && typeof metadata.sourceUrl === 'string'
      ? metadata.sourceUrl.trim()
      : '';
  const url = typeof event.url === 'string' ? event.url.trim() : '';
  return Boolean(sourceUrl || /^https?:\/\//i.test(url));
};

export const describeEventDiscoveryPresentation = (
  event: EventSummary | null | undefined,
): EventDiscoveryPresentation => {
  if (!event) {
    return {
      badgeLabel: 'Event listing',
      helper: 'This listing has limited schedule context right now.',
      primaryActionLabel: 'View event',
      primaryActionKind: 'view_event',
      secondaryActionLabel: null,
    };
  }

  const discoveryKind = inferEventDiscoveryKind(event);
  const locationKind = inferEventLocationKind(event);
  const participation = inferEventParticipationTruth(event);

  if (discoveryKind === 'session_mirror') {
    return {
      badgeLabel: 'doWhat session',
      helper:
        locationKind === 'canonical_place'
          ? 'Hosted on doWhat at a confirmed place. RSVPs stay on the session page.'
          : 'Hosted on doWhat. RSVPs stay on the session page.',
      primaryActionLabel: 'View session',
      primaryActionKind: 'view_session',
      secondaryActionLabel: null,
    };
  }

  if (discoveryKind === 'imported_event') {
    return {
      badgeLabel: 'Imported event',
      helper:
        participation.participation_truth_level === 'external_source'
          ? 'Published by an external source. Attendance stays on the source page.'
          : 'Imported listing with limited doWhat controls.',
      primaryActionLabel: 'View event',
      primaryActionKind: 'view_event',
      secondaryActionLabel: hasExternalSourceLink(event) ? 'View source' : null,
    };
  }

  return {
    badgeLabel: 'Event listing',
    helper:
      locationKind === 'flexible'
        ? 'Community listing with the location still being finalized.'
        : 'Organizer-supplied listing with limited attendance controls.',
    primaryActionLabel: 'View event',
    primaryActionKind: 'view_event',
    secondaryActionLabel: hasExternalSourceLink(event) ? 'View source' : null,
  };
};
