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
    | 'sport-banner'
    | 'pledge-banner'
    | 'traits-banner'
    | 'people-filter-banner'
    | 'sport-selector'
    | 'onboarding-card'
    | 'sports-page';
  platform: 'web' | 'mobile';
  step?: OnboardingStep;
  pendingSteps?: number;
  steps?: OnboardingStep[];
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
