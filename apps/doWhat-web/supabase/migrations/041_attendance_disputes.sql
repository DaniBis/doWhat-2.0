-- Migration 041: Attendance disputes table + policies
create extension if not exists "pgcrypto";

create table if not exists public.attendance_disputes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reason text not null check (char_length(reason) <= 120),
  details text,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_disputes_session_idx
  on public.attendance_disputes(session_id, created_at desc);

create index if not exists attendance_disputes_reporter_idx
  on public.attendance_disputes(reporter_id, created_at desc);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'attendance_disputes'
      AND trigger_name = 'trg_attendance_disputes_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_attendance_disputes_set_updated_at
      BEFORE UPDATE ON public.attendance_disputes
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

alter table public.attendance_disputes enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_disputes_service_role_access'
      AND tablename = 'attendance_disputes'
  ) THEN
    CREATE POLICY attendance_disputes_service_role_access
      ON public.attendance_disputes
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_disputes_select_own'
      AND tablename = 'attendance_disputes'
  ) THEN
    CREATE POLICY attendance_disputes_select_own
      ON public.attendance_disputes
      FOR SELECT
      USING (auth.uid() = reporter_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_disputes_insert_own'
      AND tablename = 'attendance_disputes'
  ) THEN
    CREATE POLICY attendance_disputes_insert_own
      ON public.attendance_disputes
      FOR INSERT
      WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;
