import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@/lib/supabase/service';

import { parseIcsFeed } from './parsers/ics';
import { parseJsonLdDocument } from './parsers/jsonld';
import { parseRssFeed } from './parsers/rss';
import { fetchWithRobots } from './fetcher';
import { mergeExistingEvent, toUpsertRecord, type ExistingEventRow } from './dedupe';
import type { EventSourceRow, EventUpsertRecord, IngestOptions, IngestStats, NormalizedEvent } from './types';
import { ensureTagArray, nowUtc } from './utils';
import { matchVenueForEvent } from './venueMatching';

const EVENT_BATCH_SIZE = 50;

type ServiceClient = SupabaseClient;

const loadSources = async (
  client: ServiceClient,
  options?: IngestOptions,
): Promise<EventSourceRow[]> => {
  let query = client
    .from('event_sources')
    .select('*')
    .eq('enabled', true)
    .order('updated_at', { ascending: false });

  if (options?.sourceIds?.length) {
    query = query.in('id', options.sourceIds);
  }
  if (options?.limitSources) {
    query = query.limit(options.limitSources);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load event sources: ${error.message}`);
  }
  return (data as EventSourceRow[] | null) ?? [];
};

const fetchSourceContent = async (source: EventSourceRow): Promise<string> => {
  const response = await fetchWithRobots({ url: source.url });
  return response.text();
};

const parseSource = async (source: EventSourceRow, body: string): Promise<NormalizedEvent[]> => {
  switch (source.type) {
    case 'ics':
      return parseIcsFeed(source, body);
    case 'rss':
      return parseRssFeed(source, body);
    case 'jsonld':
      return parseJsonLdDocument(source, body, source.url);
    default:
      throw new Error(`Unsupported event source type: ${source.type}`);
  }
};

const upsertEvents = async (
  client: ServiceClient,
  records: EventUpsertRecord[],
): Promise<number> => {
  if (!records.length) return 0;
  const { error } = await client.from('events').upsert(records, { onConflict: 'dedupe_key' });
  if (error) {
    throw new Error(`Failed to upsert events: ${error.message}`);
  }
  return records.length;
};

const fetchExistingEvents = async (
  client: ServiceClient,
  dedupeKeys: string[],
): Promise<Map<string, ExistingEventRow>> => {
  if (!dedupeKeys.length) return new Map();
  const uniqueKeys = Array.from(new Set(dedupeKeys));
  const { data, error } = await client
    .from('events')
    .select('*')
    .in('dedupe_key', uniqueKeys);
  if (error) {
    throw new Error(`Failed to fetch existing events: ${error.message}`);
  }
  const map = new Map<string, ExistingEventRow>();
  ((data as ExistingEventRow[] | null) ?? []).forEach((row) => {
    map.set(row.dedupe_key, row);
  });
  return map;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const updateSourceStatus = async (
  client: ServiceClient,
  source: EventSourceRow,
  status: 'ok' | 'error',
  message?: string,
): Promise<void> => {
  const patch = {
    last_fetched_at: new Date().toISOString(),
    last_status: status === 'ok' ? 'ok' : `error: ${message ?? 'unknown'}`,
    failure_count: status === 'ok' ? 0 : (source.failure_count || 0) + 1,
  };
  const { error } = await client
    .from('event_sources')
    .update(patch)
    .eq('id', source.id);
  if (error) {
    console.warn('Failed to update event source status', source.id, error);
  }
};

const dedupeByKey = (records: EventUpsertRecord[]): EventUpsertRecord[] => {
  const map = new Map<string, EventUpsertRecord>();
  records.forEach((record) => {
    const existing = map.get(record.dedupe_key);
    if (!existing) {
      map.set(record.dedupe_key, record);
      return;
    }
    // Prefer record with richer metadata
    const existingTags = existing.tags?.length ?? 0;
    const incomingTags = record.tags?.length ?? 0;
    const existingDescLen = existing.description?.length ?? 0;
    const incomingDescLen = record.description?.length ?? 0;
    const replace = incomingTags > existingTags || incomingDescLen > existingDescLen;
    if (replace) {
      map.set(record.dedupe_key, record);
    }
  });
  return Array.from(map.values());
};

const normaliseEvents = async (
  client: ServiceClient,
  source: EventSourceRow,
  events: NormalizedEvent[],
): Promise<EventUpsertRecord[]> => {
  const results: EventUpsertRecord[] = [];
  for (const event of events) {
    try {
      const venue = await matchVenueForEvent(client, event, source);
      const record = toUpsertRecord(event, venue);
      record.tags = ensureTagArray(record.tags);
      results.push(record);
    } catch (error) {
      console.warn('Failed to normalise event', event.title, error);
    }
  }
  return dedupeByKey(results);
};

const processSource = async (
  client: ServiceClient,
  source: EventSourceRow,
): Promise<IngestStats> => {
  const stats: IngestStats = {
    sourceId: source.id,
    fetched: 0,
    normalized: 0,
    persisted: 0,
    skipped: 0,
    errors: 0,
    lastStatus: 'pending',
  };

  try {
    const body = await fetchSourceContent(source);
    const rawEvents = await parseSource(source, body);
    stats.fetched = rawEvents.length;

    const events = rawEvents.filter((event) => event.startAt.getTime() >= nowUtc().getTime() - 12 * 60 * 60 * 1000);
    stats.normalized = events.length;

    const normalizedRecords = await normaliseEvents(client, source, events);
    const dedupeKeys = normalizedRecords.map((record) => record.dedupe_key);
    const existingMap = await fetchExistingEvents(client, dedupeKeys);

    const upsertRecords: EventUpsertRecord[] = normalizedRecords.map((record) => {
      const existing = existingMap.get(record.dedupe_key);
      return existing ? mergeExistingEvent(existing, record) : record;
    });

    let persisted = 0;
    for (const batch of chunk(upsertRecords, EVENT_BATCH_SIZE)) {
      persisted += await upsertEvents(client, batch);
    }
    stats.persisted = persisted;
    stats.lastStatus = 'ok';
    await updateSourceStatus(client, source, 'ok');
  } catch (error) {
    stats.errors += 1;
    stats.lastStatus = `error: ${(error as Error).message}`;
    await updateSourceStatus(client, source, 'error', (error as Error).message);
    console.error('Event ingestion error', source.url, error);
  }

  return stats;
};

export const ingestEvents = async (options?: IngestOptions) => {
  const client = createServiceClient();
  const sources = await loadSources(client, options);
  const summaries: IngestStats[] = [];
  for (const source of sources) {
    // eslint-disable-next-line no-await-in-loop
    const summary = await processSource(client, source);
    summaries.push(summary);
  }
  return {
    processed: summaries.length,
    summaries,
  };
};
