-- Migration 010: Reliability Index (attendance + reviews + reputation)
-- Creates core tables to track event participation reliability and review quality.
-- Safe to run multiple times (IF NOT EXISTS / defensive create blocks).

-- 1. Supporting enum types
do $$ begin
  create type public.event_participant_role as enum ('host','guest');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.rsvp_status as enum ('going','maybe','declined');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('attended','no_show','cancelled','excused');
exception when duplicate_object then null; end $$;

-- 2. Core events table (separate from existing sessions; future migration may hydrate from sessions)
create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  host_id uuid not null references public.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz default now()
);
create index if not exists events_host_idx on public.events(host_id);
create index if not exists events_time_idx on public.events(starts_at);

-- 3. Participants (RSVP + attendance outcome)
create table if not exists public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.event_participant_role not null default 'guest',
  rsvp_status public.rsvp_status not null default 'going',
  attendance public.attendance_status,
  punctuality text check (punctuality in ('on_time','late')),
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
);
create index if not exists event_participants_user_idx on public.event_participants(user_id);
create index if not exists event_participants_attendance_idx on public.event_participants(attendance);

-- 4. Reviews (1..5 stars + optional tags)
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete cascade,
  reviewee_id uuid not null references public.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  tags text[],
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (event_id, reviewer_id, reviewee_id)
);
create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);
create index if not exists reviews_event_idx on public.reviews(event_id);

-- 5. Reviewer reputation (0..1)
create table if not exists public.user_reputation (
  user_id uuid primary key references public.users(id) on delete cascade,
  rep numeric(4,2) not null default 0.50,
  updated_at timestamptz default now()
);

-- 6. Reliability rolling metrics (JSONB windows + lifetime)
create table if not exists public.reliability_metrics (
  user_id uuid primary key references public.users(id) on delete cascade,
  window_30d_json jsonb not null default '{}'::jsonb,
  window_90d_json jsonb not null default '{}'::jsonb,
  lifetime_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 7. Materialized reliability index
create table if not exists public.reliability_index (
  user_id uuid primary key references public.users(id) on delete cascade,
  score numeric(5,2) not null default 0.00,
  confidence numeric(3,2) not null default 0.00,
  components_json jsonb not null default '{}'::jsonb,
  last_recomputed timestamptz not null default now()
);

-- 8. Basic RLS (read own; public read for index aggregate may be desired → allow select for authenticated)
alter table public.reliability_index enable row level security;
alter table public.reliability_metrics enable row level security;
alter table public.user_reputation enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.reviews enable row level security;

-- Policies (idempotent via existence check)
do $$ begin
  if not exists (select 1 from pg_policies where policyname='reliability_index_select_auth') then
    create policy reliability_index_select_auth on public.reliability_index for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname='reliability_metrics_owner') then
    create policy reliability_metrics_owner on public.reliability_metrics for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname='user_reputation_owner') then
    create policy user_reputation_owner on public.user_reputation for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname='events_owner_insert') then
    create policy events_owner_insert on public.events for insert with check (auth.uid() = host_id);
  end if;
  if not exists (select 1 from pg_policies where policyname='events_select_auth') then
    create policy events_select_auth on public.events for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname='event_participants_self_manage') then
    create policy event_participants_self_manage on public.event_participants for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname='event_participants_select_auth') then
    create policy event_participants_select_auth on public.event_participants for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname='reviews_insert_participant') then
    create policy reviews_insert_participant on public.reviews for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname='reviews_select_auth') then
    create policy reviews_select_auth on public.reviews for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- 9. Helpful view: simple flattened snapshot combining index + 30d metrics
create or replace view public.v_reliability_overview as
  select i.user_id,
         i.score,
         i.confidence,
         (i.components_json -> 'AS_30')::text as as30,
         m.window_30d_json as metrics_30d,
         i.last_recomputed
    from public.reliability_index i
    left join public.reliability_metrics m on m.user_id = i.user_id;

-- 10. Seed base reputation rows for existing users (best-effort)
insert into public.user_reputation (user_id, rep)
select id, 0.50 from public.users u
where not exists (select 1 from public.user_reputation r where r.user_id = u.id);

-- NOTE: Nightly recompute job should populate metrics + index.
-- End migration 010.
