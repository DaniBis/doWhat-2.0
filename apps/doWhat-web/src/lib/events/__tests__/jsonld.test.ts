import { parseEventsFromHtml, parseJsonLdDocument } from '../parsers/jsonld';
import type { EventSourceRow } from '../types';

const source: EventSourceRow = {
  id: 'source-1',
  url: 'https://events.example/feed',
  type: 'jsonld',
  venue_hint: 'Fallback Venue',
  city: 'Hanoi',
  enabled: true,
  last_fetched_at: null,
  last_status: null,
  failure_count: 0,
  fetch_interval_minutes: 60,
  etag: null,
  last_modified: null,
  created_at: '2026-03-07T00:00:00.000Z',
  updated_at: '2026-03-07T00:00:00.000Z',
};

describe('event jsonld parser', () => {
  it('extracts event blocks from HTML without a DOM parser', () => {
    const events = parseEventsFromHtml(
      source,
      `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Event",
                "@id": "evt-1",
                "name": "Climbing Social",
                "startDate": "2026-03-09T19:30:00+07:00",
                "location": {
                  "@type": "Place",
                  "name": "VietClimb",
                  "address": {
                    "streetAddress": "123 Tay Ho",
                    "addressLocality": "Hanoi",
                    "addressCountry": "VN"
                  },
                  "geo": {
                    "latitude": 21.0661,
                    "longitude": 105.8229
                  }
                },
                "keywords": ["climbing", "community"]
              }
            </script>
            <script type="application/json">
              {"ignored": true}
            </script>
          </head>
        </html>
      `,
      'https://events.example/climbing-social',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceId: 'source-1',
      sourceType: 'jsonld',
      sourceUid: 'evt-1',
      title: 'Climbing Social',
      venueName: 'VietClimb',
      address: '123 Tay Ho, Hanoi, VN',
      lat: 21.0661,
      lng: 105.8229,
      status: 'scheduled',
      tags: ['climbing', 'community'],
    });
    expect(events[0]?.url).toBe('https://events.example/climbing-social');
  });

  it('parses direct JSON-LD documents including graph payloads', () => {
    const events = parseJsonLdDocument(
      source,
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Place',
            name: 'Ignore me',
          },
          {
            '@type': ['SportsEvent', 'Event'],
            '@id': 'evt-2',
            name: 'Morning Run Club',
            startDate: '2026-03-10T06:00:00+07:00',
            eventStatus: 'https://schema.org/EventScheduled',
            image: { url: 'https://events.example/run.png' },
          },
        ],
      }),
      'https://events.example/morning-run',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceUid: 'evt-2',
      title: 'Morning Run Club',
      imageUrl: 'https://events.example/run.png',
      url: 'https://events.example/morning-run',
      status: 'scheduled',
    });
  });

  it('falls back to HTML parsing when the body is not raw JSON', () => {
    const events = parseJsonLdDocument(
      source,
      `
        <html>
          <body>
            <script type="application/ld+json">
              {
                "@type": "Event",
                "name": "Sunset Yoga",
                "startDate": "2026-03-11T18:00:00+07:00"
              }
            </script>
          </body>
        </html>
      `,
      'https://events.example/sunset-yoga',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Sunset Yoga',
      venueName: 'Fallback Venue',
      url: 'https://events.example/sunset-yoga',
    });
  });

  it('skips invalid JSON-LD blocks and warns instead of throwing', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const events = parseEventsFromHtml(
      source,
      `
        <html>
          <head>
            <script type="application/ld+json">{invalid json</script>
            <script type="application/ld+json">
              {
                "@type": "Event",
                "name": "Valid Event",
                "startDate": "2026-03-12T19:00:00+07:00"
              }
            </script>
          </head>
        </html>
      `,
      'https://events.example/valid-event',
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('Valid Event');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
