import type { EventSummary } from '@dowhat/shared';

const DEFAULT_EVENT_STATE: EventSummary['event_state'] = 'scheduled';

export const normalizeEventState = (state: string | null | undefined): EventSummary['event_state'] => {
  const normalized = typeof state === 'string' ? state.trim().toLowerCase() : '';
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'canceled';
  }
  if (normalized === 'scheduled') {
    return 'scheduled';
  }
  return DEFAULT_EVENT_STATE;
};
