# Events Ingestion Pipeline

This document covers the environment variables, cron wiring, and manual workflows for the free events harvester.

## Environment variables

Add the following to `.env.local` (or the deployment platform equivalent):

```bash
CRON_SECRET="${generate_a_secret}"
EVENT_INGEST_USER_AGENT="dowhat-bot/1.0 (contact: support@dowhat.app)"
```

The ingestion service already relies on existing Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) that are present in the web app.

## Running the ingester

A single POST request triggers a full ingest run:

```bash
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://your-domain/api/cron/ingest-events
```

The handler fetches all enabled sources, parses/normalises events, performs venue matching, and upserts into `events`.

### Scheduling

* **Production** – configure your scheduler (Vercel Cron, Cloud Scheduler, etc.) to hit `/api/cron/ingest-events` every 3 hours (and optionally a nightly run).
* **Local** – run the curl command above or call `await ingestEvents()` from a Node REPL for ad-hoc tests.

## Managing sources

Use the protected admin endpoint to add/update sources:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{
        "url": "https://example.com/events.ics",
        "type": "ics",
        "venue_hint": "Example Hall",
        "city": "Bangkok"
      }' \
  https://your-domain/api/admin/event-sources
```

Supported `type` values: `ics`, `rss`, `jsonld`.

## Development checklist

1. Apply database migrations `014_places.sql` and `015_events.sql` to Supabase/Postgres.
2. Seed a few event sources and run the cron endpoint once to warm the cache.
3. Confirm `/api/events?sw=…&ne=…` returns data (Bangkok/Hanoi should produce ≥50 events when the cron has run).
4. Visit `/map` and toggle *Activities | Events | Both* to ensure the new pins and list rows appear.
5. Open an individual event at `/events/:id` and verify the CTA buttons work as expected.

If a source misbehaves, check `event_sources.last_status` and `failure_count` in the database for quick diagnostics.
