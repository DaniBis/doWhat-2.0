export type AnalyticsPayload = Record<string, unknown> | undefined;

export function trackAnalyticsEvent(event: string, payload?: AnalyticsPayload) {
  try {
    const globalAny = globalThis as unknown as {
      posthog?: { capture?: (name: string, data?: Record<string, unknown>) => void };
      analytics?: { track?: (name: string, data?: Record<string, unknown>) => void };
    };
    if (globalAny?.posthog?.capture) {
      globalAny.posthog.capture(event, payload);
      return;
    }
    if (globalAny?.analytics?.track) {
      globalAny.analytics.track(event, payload);
      return;
    }
    if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.debug(`[analytics] ${event}`, payload);
    }
  } catch (error) {
    if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.debug(`[analytics] ${event} capture failed`, error);
    }
  }
}

export type TaxonomyToggleAnalyticsPayload = {
  tier3Id: string;
  active: boolean;
  selectionCount: number;
  platform: 'web' | 'mobile';
  surface: string;
  city?: string;
};

export type TaxonomyFiltersAppliedPayload = {
  tier3Ids: string[];
  platform: 'web' | 'mobile';
  surface: string;
  city?: string;
};

export const trackTaxonomyToggle = (payload: TaxonomyToggleAnalyticsPayload) =>
  trackAnalyticsEvent('taxonomy_category_toggle', payload);

export const trackTaxonomyFiltersApplied = (payload: TaxonomyFiltersAppliedPayload) =>
  trackAnalyticsEvent('taxonomy_filters_applied', payload);

export type VerifiedMatchesRecordedPayload = {
  sessionId: string;
  hostUserId: string;
  platform: 'web' | 'mobile';
  totalUpdates: number;
  verifiedMarked: number;
  verifiedCleared: number;
  verifiedTotal?: number;
};

export const trackVerifiedMatchesRecorded = (payload: VerifiedMatchesRecordedPayload) =>
  trackAnalyticsEvent('session_verified_matches_recorded', payload);

export type OnboardingStep = 'traits' | 'sport' | 'pledge';

export type OnboardingEntryPayload = {
  source:
    | 'nav'
    | 'profile-banner'
    | 'profile-traits-banner'
    | 'profile-pledge-banner'
    | 'profile-progress-banner'
    | 'sport-banner'
    | 'pledge-banner'
    | 'traits-banner'
    | 'people-filter-banner'
    | 'sport-selector'
    | 'onboarding-card'
    | 'onboarding-card-mobile'
    | 'onboarding-summary-mobile'
    | 'onboarding-nav-mobile'
    | 'onboarding-nav-pill-mobile'
    | 'sports-page';
  platform: 'web' | 'mobile';
  step?: OnboardingStep;
  pendingSteps?: number;
  steps?: OnboardingStep[];
  nextStep?: string;
};

export const trackOnboardingEntry = (payload: OnboardingEntryPayload) =>
  trackAnalyticsEvent('onboarding_step_entry', payload);

export type SavedActivityToggleAnalyticsPayload = {
  platform: 'web' | 'mobile';
  action: 'save' | 'unsave';
  placeId: string;
  source?: string | null;
  name?: string | null;
  citySlug?: string | null;
  venueId?: string | null;
};

export const trackSavedActivityToggle = (payload: SavedActivityToggleAnalyticsPayload) =>
  trackAnalyticsEvent('saved_activity_toggle', payload);

export type SessionOpenSlotsPublishedPayload = {
  sessionId: string;
  slotsCount: number;
  platform: 'web' | 'mobile' | 'script';
  surface: string;
  requiredSkillLevel?: string | null;
  prefillSource?: string | null;
  categoryCount?: number;
  activityPrefilled?: boolean;
  venuePrefilled?: boolean;
  manualActivityEntry?: boolean;
  manualVenueEntry?: boolean;
  fakeSessionRisk?: 'low' | 'medium' | 'high';
  coordinatesProvided?: boolean;
};

export const trackSessionOpenSlotsPublished = (payload: SessionOpenSlotsPublishedPayload) =>
  trackAnalyticsEvent('session_open_slots_published', payload);

export type LookingForPlayersImpressionPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  sessionId: string;
  slotId?: string | null;
  rank: number;
  matchScore: number;
};

export const trackLookingForPlayersImpression = (payload: LookingForPlayersImpressionPayload) =>
  trackAnalyticsEvent('looking_for_players_impression', payload);

export type LookingForPlayersEngagementPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  action: 'open_session' | 'save' | 'unsave';
  sessionId: string;
  slotId?: string | null;
  rank: number;
  matchScore: number;
};

export const trackLookingForPlayersEngagement = (payload: LookingForPlayersEngagementPayload) =>
  trackAnalyticsEvent('looking_for_players_engagement', payload);

export type FindA4thSessionMetadata = {
  sessionId: string;
  sport?: string | null;
  venue?: string | null;
};

export type FindA4thImpressionPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  sessions: FindA4thSessionMetadata[];
};

export const trackFindA4thImpression = (payload: FindA4thImpressionPayload) =>
  trackAnalyticsEvent('find_a_4th_impression', payload);

export type FindA4thCardTapPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  sessionId: string;
  sport?: string | null;
  venue?: string | null;
};

export const trackFindA4thCardTap = (payload: FindA4thCardTapPayload) =>
  trackAnalyticsEvent('find_a_4th_card_tap', payload);

export type AttendanceDisputeSubmittedPayload = {
  platform: 'web' | 'mobile';
  sessionId: string;
  hasDetails: boolean;
  reasonLength: number;
};

export const trackAttendanceDisputeSubmitted = (payload: AttendanceDisputeSubmittedPayload) =>
  trackAnalyticsEvent('attendance_dispute_submitted', payload);

export type ReliabilityAttendanceLogViewedPayload = {
  platform: 'web' | 'mobile';
  surface: string;
};

export const trackReliabilityAttendanceLogViewed = (
  payload: ReliabilityAttendanceLogViewedPayload,
) => trackAnalyticsEvent('reliability_attendance_log_viewed', payload);

export type ReliabilityContestOpenedPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  sessionId: string;
};

export const trackReliabilityContestOpened = (payload: ReliabilityContestOpenedPayload) =>
  trackAnalyticsEvent('reliability_contest_opened', payload);

export type ReliabilityDisputeHistoryViewedPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  disputes: number;
  source: 'auto-load' | 'manual-refresh' | 'sheet-open' | 'post-submit';
};

export const trackReliabilityDisputeHistoryViewed = (
  payload: ReliabilityDisputeHistoryViewedPayload,
) => trackAnalyticsEvent('reliability_dispute_history_viewed', payload);

export type ReliabilityDisputeHistoryFailedPayload = {
  platform: 'web' | 'mobile';
  surface: string;
  source: ReliabilityDisputeHistoryViewedPayload['source'];
  error: string;
};

export const trackReliabilityDisputeHistoryFailed = (
  payload: ReliabilityDisputeHistoryFailedPayload,
) => trackAnalyticsEvent('reliability_dispute_history_failed', payload);
