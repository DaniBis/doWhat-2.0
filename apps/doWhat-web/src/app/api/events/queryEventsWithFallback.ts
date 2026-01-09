import type { EventSummary } from '@dowhat/shared';

import { isMissingColumnError } from '@/lib/supabase/errors';

const BASE_EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'start_at',
  'end_at',
  'timezone',
  'venue_name',
  'lat',
  'lng',
  'address',
  'url',
  'image_url',
  'status',
  'event_state',
  'tags',
  'place_id',
  'source_id',
  'source_uid',
  'reliability_score',
  'verification_confirmations',
  'verification_required',
  'metadata',
];

const MAX_QUERY_ATTEMPTS = 8;

const buildEventColumns = (
  options?: {
    aliasTitle?: boolean;
    omitEventState?: boolean;
    omitReliabilityScore?: boolean;
    omitVerificationConfirmations?: boolean;
    omitVerificationRequired?: boolean;
  },
) =>
  BASE_EVENT_COLUMNS.filter((column) => {
    if (options?.omitEventState && column === 'event_state') return false;
    if (options?.omitReliabilityScore && column === 'reliability_score') return false;
    if (options?.omitVerificationConfirmations && column === 'verification_confirmations') return false;
    if (options?.omitVerificationRequired && column === 'verification_required') return false;
    return true;
  }).map((column) => {
    if (column === 'title' && options?.aliasTitle) {
      return 'title:normalized_title';
    }
    return column;
  });

type QueryExecutionResult = {
  data: EventSummary[] | null;
  error: { message?: string | null } | null;
};

const missingColumn = (message: string | null | undefined, column: string) =>
  isMissingColumnError(message, column);

export async function queryEventsWithFallback(
  execute: (columns: string[]) => Promise<QueryExecutionResult>,
): Promise<{
  events: EventSummary[];
  error: { message?: string | null } | null;
  omittedEventState: boolean;
  omittedReliabilityScore: boolean;
  omittedVerificationConfirmations: boolean;
  omittedVerificationRequired: boolean;
}> {
  let aliasTitle = false;
  let omitEventState = false;
  let omitReliabilityScore = false;
  let omitVerificationConfirmations = false;
  let omitVerificationRequired = false;
  let lastError: { message?: string | null } | null = null;

  for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt += 1) {
    const columns = buildEventColumns({
      aliasTitle,
      omitEventState,
      omitReliabilityScore,
      omitVerificationConfirmations,
      omitVerificationRequired,
    });
    const { data, error } = await execute(columns);
    lastError = error;
    if (!error) {
      return {
        events: data ?? [],
        error: null,
        omittedEventState: omitEventState,
        omittedReliabilityScore: omitReliabilityScore,
        omittedVerificationConfirmations: omitVerificationConfirmations,
        omittedVerificationRequired: omitVerificationRequired,
      };
    }

    const message = error.message ?? '';

    if (!aliasTitle && missingColumn(message, 'title')) {
      aliasTitle = true;
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing title column, falling back to normalized_title alias');
      continue;
    }

    if (!omitEventState && missingColumn(message, 'event_state')) {
      omitEventState = true;
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing event_state column, falling back to default state');
      continue;
    }

    if (!omitReliabilityScore && missingColumn(message, 'reliability_score')) {
      omitReliabilityScore = true;
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing reliability_score column, falling back to null score');
      continue;
    }

    if (!omitVerificationConfirmations && missingColumn(message, 'verification_confirmations')) {
      omitVerificationConfirmations = true;
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing verification_confirmations column, disabling progress meter');
      continue;
    }

    if (!omitVerificationRequired && missingColumn(message, 'verification_required')) {
      omitVerificationRequired = true;
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing verification_required column, disabling progress meter');
      continue;
    }

    if (aliasTitle && missingColumn(message, 'normalized_title')) {
      // eslint-disable-next-line no-console
      console.warn('[events-api] missing both title and normalized_title columns, returning empty dataset');
      return {
        events: [],
        error: null,
        omittedEventState: omitEventState,
        omittedReliabilityScore: omitReliabilityScore,
        omittedVerificationConfirmations: omitVerificationConfirmations,
        omittedVerificationRequired: omitVerificationRequired,
      };
    }

    break;
  }

  return {
    events: [],
    error: lastError ?? { message: 'Failed to load events' },
    omittedEventState: omitEventState,
    omittedReliabilityScore: omitReliabilityScore,
    omittedVerificationConfirmations: omitVerificationConfirmations,
    omittedVerificationRequired: omitVerificationRequired,
  };
}
