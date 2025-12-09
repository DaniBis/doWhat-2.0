-- Migration 029: Final removal of legacy rsvps table
-- Drops the obsolete public.rsvps table if it still exists after earlier migrations.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rsvps'
  ) THEN
    EXECUTE 'DROP TABLE public.rsvps CASCADE';
  END IF;
END $$;
