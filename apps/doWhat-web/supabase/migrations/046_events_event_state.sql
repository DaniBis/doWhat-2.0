-- Migration 046: ensure events.event_state exists for map filters
BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_state TEXT;

ALTER TABLE public.events
  ALTER COLUMN event_state SET DEFAULT 'scheduled';

UPDATE public.events
SET event_state = 'scheduled'
WHERE event_state IS NULL OR btrim(event_state) = '';

COMMIT;
