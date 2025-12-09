-- Migration 028: Align sessions and session_attendees with the authoritative specification
create extension if not exists "uuid-ossp";

-- Ensure profiles.user_id exists for foreign key references
alter table if exists public.profiles
  add column if not exists user_id uuid;

update public.profiles
set user_id = coalesce(user_id, id);

alter table public.profiles
  alter column user_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey foreign key (user_id)
      references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists profiles_user_id_idx on public.profiles(user_id);

-- Core sessions table shape per spec
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references public.venues(id),
  activity_id uuid references public.activities(id),
  host_user_id uuid not null references public.profiles(user_id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null default 0,
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  max_attendees integer not null default 20 check (max_attendees > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions
  add column if not exists venue_id uuid,
  add column if not exists activity_id uuid,
  add column if not exists host_user_id uuid,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists price_cents integer,
  add column if not exists visibility text,
  add column if not exists max_attendees integer,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.sessions set price_cents = 0 where price_cents is null;
update public.sessions set visibility = 'public' where visibility is null or visibility not in ('public','friends','private');
update public.sessions set max_attendees = 20 where max_attendees is null or max_attendees <= 0;
update public.sessions set starts_at = coalesce(starts_at, now());
update public.sessions set ends_at = coalesce(ends_at, starts_at + interval '1 hour');
update public.sessions set created_at = coalesce(created_at, now());
update public.sessions set updated_at = coalesce(updated_at, now());

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sessions' and column_name = 'created_by'
  ) then
    execute 'update public.sessions set host_user_id = coalesce(host_user_id, created_by)';
  end if;
end $$;

-- session_attendees join table per spec
create table if not exists public.session_attendees (
  session_id uuid not null references public.sessions(id),
  user_id uuid not null references public.profiles(user_id),
  status text not null default 'going' check (status in ('going','interested','declined')),
  checked_in boolean not null default false,
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.session_attendees
  add column if not exists status text default 'going',
  add column if not exists checked_in boolean default false,
  add column if not exists attended_at timestamptz,
  add column if not exists created_at timestamptz default now();

update public.session_attendees
set status = 'going'
where status is null or status not in ('going','interested','declined');

update public.session_attendees
set checked_in = false
where checked_in is null;

update public.session_attendees
set created_at = coalesce(created_at, now());

alter table public.session_attendees
  alter column status set default 'going',
  alter column status set not null,
  alter column checked_in set default false,
  alter column checked_in set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.session_attendees drop constraint if exists session_attendees_status_check;
alter table public.session_attendees add constraint session_attendees_status_check check (status in ('going','interested','declined'));

alter table public.session_attendees drop constraint if exists session_attendees_session_id_fkey;
alter table public.session_attendees add constraint session_attendees_session_id_fkey foreign key (session_id) references public.sessions(id);

alter table public.session_attendees drop constraint if exists session_attendees_user_id_fkey;
alter table public.session_attendees add constraint session_attendees_user_id_fkey foreign key (user_id) references public.profiles(user_id);

alter table public.session_attendees drop constraint if exists session_attendees_pkey;
alter table public.session_attendees add constraint session_attendees_pkey primary key (session_id, user_id);

drop index if exists session_attendees_user_idx;
drop index if exists session_attendees_status_idx;

-- Backfill any remaining host assignments from attendance data
with ordered_attendees as (
  select
    session_id,
    user_id,
    row_number() over (
      partition by session_id
      order by case status when 'going' then 0 when 'interested' then 1 else 2 end,
               created_at nulls last,
               user_id
    ) as rn
  from public.session_attendees
),
host_candidates as (
  select session_id, user_id from ordered_attendees where rn = 1
)
update public.sessions s
set host_user_id = hc.user_id
from host_candidates hc
where s.id = hc.session_id
  and s.host_user_id is null;

do $$
declare
  fallback_host uuid;
begin
  select user_id
  into fallback_host
  from public.profiles
  where email = 'bisceanudaniel@gmail.com'
  limit 1;

  if fallback_host is null then
    select user_id
    into fallback_host
    from public.profiles
    where user_id is not null
    limit 1;
  end if;

  if fallback_host is null then
    raise exception 'No fallback host profile found to backfill sessions.';
  end if;

  update public.sessions
  set host_user_id = fallback_host
  where host_user_id is null;
end $$;

do $$
declare missing integer;
begin
  select count(*) into missing from public.sessions where host_user_id is null;
  if missing > 0 then
    raise exception 'host_user_id must be populated for all sessions (% rows still null). Please backfill before rerunning this migration.', missing;
  end if;
end $$;

alter table public.sessions
  alter column price_cents set default 0,
  alter column price_cents set not null,
  alter column visibility set default 'public',
  alter column visibility set not null,
  alter column max_attendees set default 20,
  alter column max_attendees set not null,
  alter column starts_at set not null,
  alter column ends_at set not null,
  alter column host_user_id set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.sessions drop constraint if exists sessions_visibility_check;
alter table public.sessions add constraint sessions_visibility_check check (visibility in ('public','friends','private'));

alter table public.sessions drop constraint if exists sessions_max_attendees_check;
alter table public.sessions add constraint sessions_max_attendees_check check (max_attendees > 0);

alter table public.sessions drop constraint if exists sessions_venue_id_fkey;
alter table public.sessions add constraint sessions_venue_id_fkey foreign key (venue_id) references public.venues(id);

alter table public.sessions drop constraint if exists sessions_activity_id_fkey;
alter table public.sessions add constraint sessions_activity_id_fkey foreign key (activity_id) references public.activities(id);

alter table public.sessions drop constraint if exists sessions_host_user_id_fkey;
alter table public.sessions add constraint sessions_host_user_id_fkey foreign key (host_user_id) references public.profiles(user_id);

create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
create index if not exists sessions_venue_id_idx on public.sessions(venue_id);
