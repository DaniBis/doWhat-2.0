import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@/lib/supabase/service';

import { parseIcsFeed } from './parsers/ics';
import { parseJsonLdDocument } from './parsers/jsonld';
import { parseRssFeed } from './parsers/rss';
import { fetchWithRobots } from './fetcher';
import { mergeExistingEvent, toUpsertRecord, type ExistingEventRow } from './dedupe';
import type { EventSourceRow, EventUpsertRecord, IngestOptions, IngestStats, NormalizedEvent } from './types';
import { ensureTagArray, nowUtc } from './utils';
import { annotateLocationVerification, createVerificationIndex, type VerificationIndex } from './verification';
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
  const primary = await client.from('events').upsert(records, { onConflict: 'dedupe_key' });
  if (!primary.error) {
    return records.length;
  }

  const message = primary.error.message ?? '';
  const needsLegacyCompat =
    /host_id/i.test(message)
    || /starts_at/i.test(message)
    || /ends_at/i.test(message);

  if (!needsLegacyCompat) {
    throw new Error(`Failed to upsert events: ${primary.error.message}`);
  }

  const hostId = await resolveIngestionHostId(client);
  if (!hostId) {
    throw new Error(`Failed to upsert events: ${primary.error.message}`);
  }

  const compatRecords: Record<string, unknown>[] = records.map((record) => ({
    ...record,
    host_id: hostId,
    starts_at: record.start_at,
    ends_at: record.end_at ?? record.start_at,
  }));

  const compat = await client.from('events').upsert(compatRecords, { onConflict: 'dedupe_key' });
  if (compat.error) {
    throw new Error(`Failed to upsert events: ${compat.error.message}`);
  }

  return records.length;
};

let ingestionHostIdCache: string | null | undefined;

const resolveIngestionHostId = async (client: ServiceClient): Promise<string | null> => {
  if (typeof ingestionHostIdCache !== 'undefined') {
    return ingestionHostIdCache;
  }

  const configured = process.env.EVENT_INGEST_HOST_ID?.trim();
  if (configured) {
    ingestionHostIdCache = configured;
    return ingestionHostIdCache;
  }

  try {
    const { data, error } = await client
      .from('users')
      .select('id')
      .limit(1)
      .maybeSingle<{ id: string | null }>();
    if (error) {
      ingestionHostIdCache = null;
      return null;
    }
    ingestionHostIdCache = data?.id ?? null;
    return ingestionHostIdCache;
  } catch {
    ingestionHostIdCache = null;
    return null;
  }
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
  verificationIndex: VerificationIndex,
): Promise<IngestStats> => {
  const stats: IngestStats = {
    sourceId: source.id,
    fetched: 0,
    normalized: 0,
    persisted: 0,
    skipped: 0,
    errors: 0,
    locationVerified: 0,
    locationPending: 0,
    lastStatus: 'pending',
  };

  try {
    const body = await fetchSourceContent(source);
    const rawEvents = await parseSource(source, body);
    stats.fetched = rawEvents.length;

    const events = rawEvents.filter((event) => event.startAt.getTime() >= nowUtc().getTime() - 12 * 60 * 60 * 1000);
    stats.normalized = events.length;

    const normalizedRecords = await normaliseEvents(client, source, events);
    const verified = annotateLocationVerification(normalizedRecords, source, verificationIndex);
    stats.locationVerified = verified.verifiedCount;
    stats.locationPending = verified.pendingCount;

    const dedupeKeys = verified.records.map((record) => record.dedupe_key);
    const existingMap = await fetchExistingEvents(client, dedupeKeys);

    const upsertRecords: EventUpsertRecord[] = verified.records.map((record) => {
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
  const verificationIndex = createVerificationIndex();
  const concurrency = Math.max(1, Math.min(6, Math.round(options?.concurrency ?? 1)));
  const summaries: IngestStats[] = [];

  let cursor = 0;
  const nextSource = (): EventSourceRow | null => {
    if (cursor >= sources.length) return null;
    const source = sources[cursor];
    cursor += 1;
    return source;
  };

  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    while (true) {
      const source = nextSource();
      if (!source) break;
      const summary = await processSource(client, source, verificationIndex);
      summaries.push(summary);
    }
  });

  await Promise.all(workers);
  return {
    processed: summaries.length,
    summaries,
  };
};
