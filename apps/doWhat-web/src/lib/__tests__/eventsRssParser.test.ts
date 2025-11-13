import { afterEach, describe, expect, jest, test } from '@jest/globals';

const parseEventsFromHtmlMock = jest.fn();

jest.mock('../events/parsers/jsonld', () => ({
  __esModule: true,
  parseEventsFromHtml: parseEventsFromHtmlMock,
}));

import type { EventSourceRow } from '../events/types';

const originalFetch = global.fetch;

const baseSource = (overrides: Partial<EventSourceRow> = {}): EventSourceRow => ({
  id: 'source-2',
  url: 'https://example.com/rss',
  type: 'rss',
  venue_hint: null,
  city: 'Hanoi',
  enabled: true,
  last_fetched_at: null,
  last_status: null,
  failure_count: 0,
  fetch_interval_minutes: null,
  etag: null,
  last_modified: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('parseRssFeed', () => {
  test('returns JSON-LD events parsed from linked article', async () => {
    const rssBody = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>City Events</title>
          <item>
            <title>Outdoor Cinema</title>
            <link>https://example.com/articles/outdoor-cinema</link>
            <guid>abc-123</guid>
            <pubDate>Wed, 13 Nov 2024 12:00:00 GMT</pubDate>
            <category>film</category>
          </item>
        </channel>
      </rss>`;

    const htmlResponse = '<html></html>';

    const fetchMock = jest.fn(async (input: RequestInfo) => {
      const target = typeof input === 'string' ? input : input.toString();
      if (target.endsWith('/robots.txt')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'User-agent: *\nAllow: /',
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => htmlResponse,
      } as Response;
    });

    global.fetch = fetchMock as unknown as typeof global.fetch;

    parseEventsFromHtmlMock.mockReturnValue([
      {
        sourceId: 'source-2',
        sourceType: 'rss',
        sourceUrl: 'https://example.com/rss',
        sourceUid: 'abc-123',
        title: 'Outdoor Cinema',
        normalizedTitle: 'outdoor cinema',
        description: 'Movies under the stars',
        url: 'https://example.com/articles/outdoor-cinema',
        imageUrl: null,
        status: 'scheduled',
        startAt: new Date('2024-11-15T18:00:00+07:00'),
        endAt: new Date('2024-11-15T21:00:00+07:00'),
        timezone: 'Asia/Bangkok',
        venueName: 'Benjakitti Park',
        address: 'Benjakitti Park',
        lat: 13.73,
        lng: 100.56,
        tags: ['outdoors'],
        metadata: {},
      },
    ]);

    const { parseRssFeed } = await import('../events/parsers/rss');
    const events = await parseRssFeed(baseSource(), rssBody);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const articleCall = fetchMock.mock.calls[1]?.[0];
    expect(typeof articleCall === 'string' ? articleCall : articleCall?.toString()).toBe('https://example.com/articles/outdoor-cinema');
    expect(parseEventsFromHtmlMock).toHaveBeenCalledWith(expect.any(Object), htmlResponse, 'https://example.com/articles/outdoor-cinema');
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.title).toBe('Outdoor Cinema');
    expect(event.tags).toContain('film');
  });
});
