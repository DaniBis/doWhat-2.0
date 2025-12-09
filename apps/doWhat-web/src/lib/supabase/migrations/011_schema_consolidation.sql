-- Migration 011: Schema consolidation (sessions/session_attendees -> events/event_participants)
-- Goal: Backfill newly introduced reliability tables from legacy session attendance data.
-- Safe / idempotent: uses IF NOT EXISTS guards and left joins to avoid duplicates.

-- 1. Add mapping column on events to record origin session id (if not already added)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='events' AND column_name='source_session_id'
  ) THEN
    ALTER TABLE public.events ADD COLUMN source_session_id uuid UNIQUE;
  END IF;
END $$;

-- 2. Backfill events from sessions (best-effort: requires sessions table + minimal columns)
DO $$
DECLARE
  has_starts boolean := false;
  has_ends boolean := false;
  has_created_by boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='starts_at'
  ) INTO has_starts;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='ends_at'
  ) INTO has_ends;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='created_by'
  ) INTO has_created_by;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN
    -- Insert rows that have not yet been migrated (no matching events.source_session_id)
    EXECUTE format(
      'INSERT INTO public.events(host_id, starts_at, ends_at, status, source_session_id)
       SELECT %s, %s, %s, ''scheduled'', s.id
       FROM public.sessions s
       LEFT JOIN public.events e ON e.source_session_id = s.id
       WHERE e.id IS NULL',
       CASE WHEN has_created_by THEN 's.created_by' ELSE 'NULL' END,
       CASE WHEN has_starts THEN 's.starts_at' ELSE 'now()' END,
       CASE WHEN has_ends THEN 's.ends_at' ELSE (CASE WHEN has_starts THEN 's.starts_at + interval ''1 hour''' ELSE 'now() + interval ''1 hour''' END) END
    );
  END IF;
END $$;

-- 3. Backfill participants from session_attendees (guest role) + ensure host rows
DO $$
DECLARE
  has_status boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='session_attendees' AND column_name='status'
  ) INTO has_status;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='session_attendees') THEN
    -- Participant rows for guests (map rsvp.status values into enum if possible)
    EXECUTE format(
      'INSERT INTO public.event_participants(event_id, user_id, role, rsvp_status, updated_at)
       SELECT e.id, r.user_id, ''guest'', %s, now()
       FROM public.session_attendees r
       JOIN public.sessions s ON s.id = r.session_id
       JOIN public.events e ON e.source_session_id = s.id
       LEFT JOIN public.event_participants ep ON ep.event_id = e.id AND ep.user_id = r.user_id
       WHERE ep.user_id IS NULL',
       CASE WHEN has_status THEN 'CASE r.status WHEN ''going'' THEN ''going'' WHEN ''interested'' THEN ''maybe'' ELSE ''declined'' END' ELSE '''going''' END
    );
  END IF;
  -- Host participant rows (role host)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='created_by') THEN
    INSERT INTO public.event_participants(event_id, user_id, role, rsvp_status, updated_at)
    SELECT e.id, s.created_by, 'host', 'going', now()
    FROM public.sessions s
    JOIN public.events e ON e.source_session_id = s.id
    LEFT JOIN public.event_participants ep ON ep.event_id = e.id AND ep.user_id = s.created_by
    WHERE s.created_by IS NOT NULL AND ep.user_id IS NULL;
  END IF;
END $$;

-- 4. (Optional) Simple view linking sessions to events for transition
CREATE OR REPLACE VIEW public.v_sessions_events AS
  SELECT s.*, e.id AS event_id
  FROM public.sessions s
  LEFT JOIN public.events e ON e.source_session_id = s.id;

-- End migration 011.
