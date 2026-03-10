-- Migration 068: discovery query support indexes
-- Adds only additive indexes for operators that are already used by the
-- discovery/event paths in production code. No behavioral SQL rewrite.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'geom'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activities_geom ON public.activities USING GIST (geom)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'activity_types'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activities_activity_types_gin ON public.activities USING GIN (activity_types) WHERE activity_types IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activities_tags_gin ON public.activities USING GIN (tags) WHERE tags IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_tags_gin ON public.events USING GIN (tags)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'activity_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'starts_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sessions_activity_id_starts_at ON public.sessions (activity_id, starts_at) WHERE activity_id IS NOT NULL';
  END IF;
END $$;

COMMIT;
