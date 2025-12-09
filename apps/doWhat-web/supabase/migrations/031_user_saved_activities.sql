-- Migration 031: Saved activities storage for map + mobile clients
create extension if not exists "pgcrypto";

-- 1. Persistent table ---------------------------------------------------------
create table if not exists public.user_saved_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  place_id text not null,
  venue_id uuid references public.venues(id) on delete set null,
  place_slug text,
  place_name text,
  place_address text,
  city_slug text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index if not exists user_saved_activities_user_idx on public.user_saved_activities(user_id);
create index if not exists user_saved_activities_place_idx on public.user_saved_activities(place_id);
create index if not exists user_saved_activities_venue_idx on public.user_saved_activities(venue_id);

create or replace function public.touch_user_saved_activities_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'user_saved_activities'
      and trigger_name = 'trg_user_saved_activities_set_updated_at'
  ) then
    create trigger trg_user_saved_activities_set_updated_at
      before update on public.user_saved_activities
      for each row execute function public.touch_user_saved_activities_updated_at();
  end if;
end $$;

alter table public.user_saved_activities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_saved_activities'
      and policyname = 'user_saved_activities_select'
  ) then
    create policy user_saved_activities_select on public.user_saved_activities
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_saved_activities'
      and policyname = 'user_saved_activities_mutate'
  ) then
    create policy user_saved_activities_mutate on public.user_saved_activities
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- 2. Helper views -------------------------------------------------------------
create or replace view public.user_saved_activities_view as
select
  usa.id,
  usa.user_id,
  usa.place_id,
  usa.venue_id,
  usa.place_slug,
  usa.place_name,
  usa.place_address,
  usa.city_slug,
  usa.metadata,
  usa.created_at,
  usa.updated_at,
  v.name as venue_name,
  v.address as venue_address,
  v.city as venue_city,
  v.country as venue_country,
  v.lat,
  v.lng,
  coalesce(sc.upcoming_sessions, 0) as sessions_count
from public.user_saved_activities usa
left join public.venues v on v.id = usa.venue_id
left join lateral (
  select count(*)::int as upcoming_sessions
  from public.sessions s
  where s.venue_id = usa.venue_id
    and s.starts_at >= now()
) sc on true;

create or replace view public.saved_activities_view as
select
  user_id,
  place_id as id,
  coalesce(place_name, venue_name) as name,
  null::text as cover_url,
  sessions_count,
  updated_at
from public.user_saved_activities_view;

create or replace view public.saved_activities as
select * from public.saved_activities_view;
