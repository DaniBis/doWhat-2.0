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
