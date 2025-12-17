type CheerioLib = typeof import('cheerio');

let cachedCheerio: CheerioLib | null = null;
let cachedLoad: CheerioLib['load'] | null = null;

const getCheerioLoad = (): CheerioLib['load'] => {
  if (cachedLoad) return cachedLoad;
  if (!cachedCheerio) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- Jest needs the CommonJS entry
    cachedCheerio = require('cheerio') as CheerioLib;
  }
  cachedLoad = cachedCheerio.load;
  return cachedLoad;
};

import type { EventSourceRow, NormalizedEvent } from '../types';
import {
  cleanString,
  ensureTagArray,
  normaliseTitle,
  parseMaybeNumber,
  toDate,
} from '../utils';

interface JsonLdNode {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const flattenGraph = (node: unknown): JsonLdNode[] => {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap((value) => flattenGraph(value));
  }
  if (typeof node === 'object' && node && '@graph' in node) {
    return flattenGraph((node as JsonLdNode)['@graph']);
  }
  if (typeof node === 'object') {
    return [node as JsonLdNode];
  }
  return [];
};

const extractGeo = (node: JsonLdNode | undefined): { lat: number | null; lng: number | null } => {
  if (!node) return { lat: null, lng: null };
  const lat = parseMaybeNumber(node.latitude ?? node.lat);
  const lng = parseMaybeNumber(node.longitude ?? node.lng);
  return { lat, lng };
};

const extractAddress = (node: JsonLdNode | undefined): string | null => {
  if (!node) return null;
  const parts = [
    node.streetAddress,
    node.addressLocality,
    node.addressRegion,
    node.postalCode,
    node.addressCountry,
  ]
    .map((part) => cleanString(part))
    .filter((part) => part.length > 0);
  return parts.length ? parts.join(', ') : null;
};

const firstNonEmpty = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const cleaned = cleanString(value ?? '');
    if (cleaned) return cleaned;
  }
  return null;
};

const toImageUrl = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string') as string | undefined;
    if (first) return cleanString(first);
  }
  if (typeof value === 'object') {
    const objectValue = value as JsonLdNode;
    return cleanString(objectValue.url ?? objectValue.contentUrl ?? objectValue['@id']);
  }
  return null;
};

const extractTags = (node: JsonLdNode): string[] => {
  const tags: string[] = [];
  if (node.eventAttendanceMode) tags.push(String(node.eventAttendanceMode));
  if (node.eventStatus) tags.push(String(node.eventStatus));
  if (node.keywords) {
    tags.push(...asArray(node.keywords).map((keyword) => String(keyword)));
  }
  if (node.category) {
    tags.push(...asArray(node.category).map((value) => String(value)));
  }
  return ensureTagArray(tags);
};

const toStatus = (raw: string | undefined): 'scheduled' | 'canceled' =>
  raw && raw.toLowerCase().includes('cancel') ? 'canceled' : 'scheduled';

const normaliseEventNode = (
  node: JsonLdNode,
  source: EventSourceRow,
  baseUrl: string,
): NormalizedEvent | null => {
  const objectNode = node as JsonLdNode;
  const typeCandidates = asArray(node['@type']).map((value) => String(value).toLowerCase());
  if (!typeCandidates.some((value) => value.includes('event'))) {
    return null;
  }

  const name = cleanString(objectNode.name || objectNode.headline || objectNode.summary || objectNode.title);
  if (!name) return null;

  const startDate = toDate(objectNode.startDate || objectNode.startTime || objectNode.datePublished || objectNode.releaseDate);
  if (!startDate) return null;

  const endDate = toDate(objectNode.endDate || objectNode.doorTime || objectNode.closingTime);
  const location = objectNode.location || objectNode['@location'];
  const venueName = firstNonEmpty(location?.name, location?.address?.name, source.venue_hint);
  const { lat, lng } = extractGeo(location?.geo || objectNode.geo);
  const address = extractAddress(location?.address) || cleanString(location?.streetAddress);
  const description = cleanString(objectNode.description || objectNode.abstract || objectNode.articleBody);
  const url = cleanString(objectNode.url || objectNode['@id'] || baseUrl || source.url);
  const imageUrl = toImageUrl(objectNode.image || objectNode.photo || objectNode.thumbnailUrl);
  const tags = extractTags(objectNode);
  const status = toStatus(typeof objectNode.eventStatus === 'string' ? objectNode.eventStatus : undefined);
  const timezone = cleanString(objectNode.startDateTimeZone || objectNode.timezone || objectNode.timeZone || objectNode.tzid);

  return {
    sourceId: source.id,
    sourceType: source.type,
    sourceUrl: source.url,
    sourceUid: cleanString(objectNode['@id'] || objectNode.identifier || objectNode.url || null),
    title: name,
    normalizedTitle: normaliseTitle(name),
    description: description || null,
    url,
    imageUrl,
    status,
    startAt: startDate,
    endAt: endDate ?? null,
    timezone: timezone || null,
    venueName: venueName || null,
    address: address || null,
    lat: lat ?? null,
    lng: lng ?? null,
    tags,
    metadata: {
      jsonldType: objectNode['@type'] || null,
      source: 'jsonld',
      sourceUrl: baseUrl,
    },
  };
};

export const parseEventsFromHtml = (
  source: EventSourceRow,
  html: string,
  baseUrl: string,
): NormalizedEvent[] => {
  const $ = getCheerioLoad()(html);
  const scripts = $('script[type="application/ld+json"]');
  const events: NormalizedEvent[] = [];

  scripts.each((_, element) => {
    const jsonText = $(element).contents().text();
    try {
      const parsed = JSON.parse(jsonText) as JsonLdNode;
      const nodes = flattenGraph(parsed);
      nodes.forEach((node) => {
        const event = normaliseEventNode(node, source, baseUrl);
        if (event) events.push(event);
      });
    } catch (error) {
      console.warn('Failed to parse JSON-LD block', source.url, error);
    }
  });

  return events;
};

export const parseJsonLdDocument = (
  source: EventSourceRow,
  content: string,
  baseUrl: string,
): NormalizedEvent[] => {
  try {
    const parsed = JSON.parse(content) as JsonLdNode;
    return flattenGraph(parsed)
      .map((node) => normaliseEventNode(node, source, baseUrl))
      .filter((value): value is NormalizedEvent => Boolean(value));
  } catch (error) {
    // Fallback: treat as HTML
    return parseEventsFromHtml(source, content, baseUrl);
  }
};
