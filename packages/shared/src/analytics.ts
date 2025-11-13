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
