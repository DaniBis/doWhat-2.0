-- Migration 027: Sessions + attendance refresh
create extension if not exists "uuid-ossp";

-- Ensure profiles.user_id exists for new foreign keys
alter table public.profiles
  add column if not exists user_id uuid;

update public.profiles
set user_id = coalesce(user_id, id);

alter table public.profiles
  alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.constraint_column_usage
    where table_name = 'profiles'
      and constraint_name = 'profiles_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey foreign key (user_id)
      references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists profiles_user_id_idx on public.profiles(user_id);

-- Normalize sessions table
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references public.venues(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  host_user_id uuid not null references public.profiles(user_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null default 0,
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  max_attendees integer not null default 20 check (max_attendees > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rename legacy column if still present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'created_by'
  )
  THEN
    ALTER TABLE public.sessions RENAME COLUMN created_by TO host_user_id;
  END IF;
END $$;

-- Add/align required columns
alter table public.sessions
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists activity_id uuid references public.activities(id) on delete set null,
  add column if not exists host_user_id uuid references public.profiles(user_id) on delete cascade,
  add column if not exists price_cents integer not null default 0,
  add column if not exists visibility text not null default 'public',
  add column if not exists max_attendees integer not null default 20,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.sessions set starts_at = coalesce(starts_at, now());
update public.sessions set ends_at = coalesce(ends_at, starts_at + interval '1 hour');
alter table public.sessions
  alter column price_cents set default 0,
  alter column price_cents set not null,
  alter column visibility set default 'public',
  alter column visibility set not null,
  alter column max_attendees set default 20,
  alter column max_attendees set not null,
  alter column starts_at set not null,
  alter column ends_at set not null;

DO $$
DECLARE
  hostless integer := 0;
BEGIN
  SELECT count(*) INTO hostless FROM public.sessions WHERE host_user_id IS NULL;
  IF hostless = 0 THEN
    ALTER TABLE public.sessions ALTER COLUMN host_user_id SET NOT NULL;
  ELSE
    RAISE NOTICE '[sessions] host_user_id left nullable for % rows', hostless;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_visibility_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_visibility_check
      CHECK (visibility in ('public','friends','private'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_max_attendees_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_max_attendees_check
      CHECK (max_attendees > 0);
  END IF;
END $$;

create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
create index if not exists sessions_venue_id_idx on public.sessions(venue_id);

create or replace function public.touch_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'sessions'
      AND trigger_name = 'trg_sessions_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_sessions_set_updated_at
      BEFORE UPDATE ON public.sessions
      FOR EACH ROW EXECUTE FUNCTION public.touch_sessions_updated_at();
  END IF;
END $$;

-- Attendance table
create table if not exists public.session_attendees (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','declined')),
  checked_in boolean not null default false,
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists session_attendees_user_idx on public.session_attendees(user_id);
create index if not exists session_attendees_status_idx on public.session_attendees(status);

-- RLS policies
alter table public.sessions enable row level security;
alter table public.session_attendees enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'sessions_public_select'
  ) THEN
    CREATE POLICY sessions_public_select ON public.sessions
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'sessions_host_manage'
  ) THEN
    CREATE POLICY sessions_host_manage ON public.sessions
      FOR ALL USING (auth.uid() = host_user_id)
      WITH CHECK (auth.uid() = host_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'session_attendees_public_select'
  ) THEN
    CREATE POLICY session_attendees_public_select ON public.session_attendees
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'session_attendees_self_manage'
  ) THEN
    CREATE POLICY session_attendees_self_manage ON public.session_attendees
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
