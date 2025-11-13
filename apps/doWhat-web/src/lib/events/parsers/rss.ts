import Parser from 'rss-parser';

import type { EventSourceRow, NormalizedEvent } from '../types';
import { fetchWithRobots } from '../fetcher';
import {
  cleanString,
  ensureTagArray,
  normaliseTitle,
  nowUtc,
  parseMaybeNumber,
  toDate,
} from '../utils';
import { parseEventsFromHtml } from './jsonld';

const rssParser = new Parser({ timeout: 30_000 });
const MAX_ARTICLES_TO_FETCH = 25;

const parseRssDate = (item: Parser.Item): Date | null => {
  const candidates = [item.isoDate, item.pubDate, item.pubDate?.toString(), (item as Record<string, unknown>)['dc:date'] as string | undefined];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = toDate(candidate);
    if (date) return date;
  }
  return null;
};

const parseTags = (item: Parser.Item): string[] => {
  const tags: string[] = [];
  if (item.categories) {
    tags.push(...item.categories.map((category) => cleanString(category)));
  }
  const keywords = (item as Record<string, unknown>)['media:keywords'];
  if (typeof keywords === 'string') {
    tags.push(...cleanString(keywords).split(','));
  }
  return ensureTagArray(tags);
};

const fallbackDescription = (item: Parser.Item): string | null => {
  const mediaDescription = (item as Record<string, unknown>)['media:description'];
  const snippet = cleanString(item.contentSnippet || item.summary || (typeof mediaDescription === 'string' ? mediaDescription : undefined));
  return snippet || null;
};

export const parseRssFeed = async (
  source: EventSourceRow,
  body: string,
): Promise<NormalizedEvent[]> => {
  const feed = await rssParser.parseString(body);
  const events: NormalizedEvent[] = [];
  const now = nowUtc();

  const items = feed.items.slice(0, MAX_ARTICLES_TO_FETCH);

  // Fetch articles sequentially to avoid overwhelming hosts. Could be parallelised with throttling later.
  for (const item of items) {
    const title = cleanString(item.title || '');
    if (!title) continue;
    const normalizedTitle = normaliseTitle(title);
    const link = cleanString(item.link || item.guid || source.url);
    const startAt = parseRssDate(item) ?? now;
    const tags = parseTags(item);

    let pageEvents: NormalizedEvent[] = [];
    if (link) {
      try {
        const response = await fetchWithRobots({ url: link });
        const html = await response.text();
        pageEvents = parseEventsFromHtml(source, html, link).map((event) => ({
          ...event,
          tags: ensureTagArray([...event.tags ?? [], ...tags]),
          url: event.url ?? link,
          sourceType: source.type,
        }));
      } catch (error) {
        console.warn('RSS JSON-LD extraction failed', link, error);
      }
    }

    if (pageEvents.length) {
      events.push(...pageEvents);
      continue;
    }

    const description = fallbackDescription(item);
    const mediaContent = (item as Record<string, unknown>)['media:content'];
    const enclosureUrl = typeof item.enclosure?.url === 'string' ? cleanString(item.enclosure.url) : undefined;
    const mediaUrl =
      mediaContent &&
      typeof mediaContent === 'object' &&
      'url' in mediaContent &&
      typeof (mediaContent as { url?: unknown }).url === 'string'
        ? cleanString((mediaContent as { url?: string }).url ?? '')
        : undefined;
    const imageUrl = enclosureUrl || mediaUrl;
    const lat = parseMaybeNumber((item as Record<string, unknown>)['geo:lat']);
    const lng = parseMaybeNumber((item as Record<string, unknown>)['geo:long'] ?? (item as Record<string, unknown>)['geo:lng']);

    const fallbackEvent: NormalizedEvent = {
      sourceId: source.id,
      sourceType: source.type,
      sourceUrl: source.url,
      sourceUid: cleanString(item.guid || link || title),
      title,
      normalizedTitle,
      description,
      url: link,
      imageUrl: imageUrl || null,
      status: 'scheduled',
      startAt: startAt ?? now,
      endAt: null,
      timezone: null,
      venueName: source.venue_hint || null,
      address: null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags,
      metadata: {
        source: 'rss',
        feedTitle: feed.title || null,
      },
    };

    events.push(fallbackEvent);
  }

  return events;
};
