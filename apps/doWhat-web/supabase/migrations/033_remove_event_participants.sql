-- Migration 033: Remove legacy event_participants + rsvp_status enum
-- This table/type powered the pre-session_attendees RSVP stack. All runtime
-- code now relies exclusively on session_attendees, so we can drop the
-- leftovers to prevent drift and keep future migrations clear.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'event_participants'
  ) THEN
    EXECUTE 'DROP TABLE public.event_participants CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'rsvp_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'DROP TYPE public.rsvp_status';
  END IF;
END $$;
