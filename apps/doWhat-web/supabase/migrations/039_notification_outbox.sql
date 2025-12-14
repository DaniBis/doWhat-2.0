-- Migration 039: Notification outbox and attendee-joined trigger
create extension if not exists "pgcrypto";

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  session_id uuid not null references public.sessions(id) on delete cascade,
  host_user_id uuid not null references public.profiles(id) on delete cascade,
  attendee_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_phone text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  dedupe_key text not null,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_outbox_dedupe_key_idx
  on public.notification_outbox(dedupe_key);

create index if not exists notification_outbox_status_idx
  on public.notification_outbox(status, created_at);

create index if not exists notification_outbox_session_idx
  on public.notification_outbox(session_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'notification_outbox'
      AND trigger_name = 'trg_notification_outbox_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_notification_outbox_set_updated_at
      BEFORE UPDATE ON public.notification_outbox
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'notification_outbox_service_role_access'
      AND tablename = 'notification_outbox'
  ) THEN
    CREATE POLICY notification_outbox_service_role_access
      ON public.notification_outbox
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_session_attendance_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_host_id uuid;
  v_host_phone text;
  v_dedupe text;
BEGIN
  SELECT host_user_id INTO v_host_id
  FROM public.sessions
  WHERE id = NEW.session_id;

  IF v_host_id IS NULL OR v_host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT whatsapp INTO v_host_phone
  FROM public.profiles
  WHERE id = v_host_id;

  v_dedupe := format('attendee_joined:%s:%s', NEW.session_id, NEW.user_id);

  INSERT INTO public.notification_outbox (
    event_type,
    session_id,
    host_user_id,
    attendee_user_id,
    recipient_phone,
    payload,
    status,
    dedupe_key
  ) VALUES (
    'attendee_joined',
    NEW.session_id,
    v_host_id,
    NEW.user_id,
    v_host_phone,
    jsonb_build_object(
      'session_id', NEW.session_id,
      'attendee_user_id', NEW.user_id,
      'attendance_status', NEW.attendance_status,
      'joined_at', NEW.created_at
    ),
    'pending',
    v_dedupe
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'session_attendees'
      AND trigger_name = 'notification_outbox_attendee_joined_trg'
  ) THEN
    DROP TRIGGER notification_outbox_attendee_joined_trg ON public.session_attendees;
  END IF;
END $$;

CREATE TRIGGER notification_outbox_attendee_joined_trg
AFTER INSERT ON public.session_attendees
FOR EACH ROW EXECUTE FUNCTION public.enqueue_session_attendance_notification();
