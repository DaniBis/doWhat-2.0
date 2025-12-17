-- Migration 021: User Trait & Vibe System
-- Implements trait catalog, onboarding storage, post-session votes, and summary table.

-- 1. Master trait catalog ----------------------------------------------------
create table if not exists public.traits (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#0EA5E9',
  icon text not null default 'Sparkles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists traits_name_idx on public.traits (lower(name));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_traits_updated'
      and tgrelid = 'public.traits'::regclass
  ) then
    create trigger trg_traits_updated
      before update on public.traits
      for each row execute function public.set_updated_at();
  end if;
end$$;

-- 2. User-selected base traits (onboarding) ----------------------------------
create table if not exists public.user_base_traits (
  user_id uuid not null references public.users(id) on delete cascade,
  trait_id uuid not null references public.traits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, trait_id)
);
create index if not exists user_base_traits_trait_idx on public.user_base_traits(trait_id);

-- 3. Post-session trait votes -------------------------------------------------
create table if not exists public.user_trait_votes (
  id uuid primary key default gen_random_uuid(),
  to_user uuid not null references public.users(id) on delete cascade,
  from_user uuid not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  trait_id uuid not null references public.traits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, from_user, to_user, trait_id)
);
create index if not exists user_trait_votes_session_idx on public.user_trait_votes(session_id);
create index if not exists user_trait_votes_to_idx on public.user_trait_votes(to_user);

-- 4. Aggregate trait summary --------------------------------------------------
create table if not exists public.user_trait_summary (
  user_id uuid not null references public.users(id) on delete cascade,
  trait_id uuid not null references public.traits(id) on delete cascade,
  score integer not null default 0,
  base_count integer not null default 0,
  vote_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, trait_id)
);
create index if not exists user_trait_summary_score_idx on public.user_trait_summary(user_id, score desc);

-- 5. Helper function to atomically increment scores -------------------------
create or replace function public.increment_user_trait_score(
  p_user uuid,
  p_trait uuid,
  p_score_delta integer,
  p_vote_delta integer default 0,
  p_base_delta integer default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_trait_summary(user_id, trait_id, score, vote_count, base_count, updated_at)
  values (p_user, p_trait, greatest(0, coalesce(p_score_delta, 0)), greatest(0, coalesce(p_vote_delta, 0)), greatest(0, coalesce(p_base_delta, 0)), now())
  on conflict (user_id, trait_id)
  do update set
    score = greatest(0, public.user_trait_summary.score + coalesce(p_score_delta, 0)),
    vote_count = greatest(0, public.user_trait_summary.vote_count + coalesce(p_vote_delta, 0)),
    base_count = greatest(0, public.user_trait_summary.base_count + coalesce(p_base_delta, 0)),
    updated_at = now();
end;
$$;

grant execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) to authenticated;

grant execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) to service_role;

-- 6. Row-level security ------------------------------------------------------
alter table public.traits enable row level security;
alter table public.user_base_traits enable row level security;
alter table public.user_trait_votes enable row level security;
alter table public.user_trait_summary enable row level security;

-- traits: anyone can read catalog
drop policy if exists traits_public_read on public.traits;
create policy traits_public_read on public.traits for select using (true);

-- allow service/admin inserts (optional) and prevent direct user writes unless needed
drop policy if exists traits_admin_write on public.traits;
create policy traits_admin_write on public.traits for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- user_base_traits: owners manage their selections
drop policy if exists user_base_traits_owner_select on public.user_base_traits;
create policy user_base_traits_owner_select on public.user_base_traits for select using (auth.uid() = user_id);

drop policy if exists user_base_traits_owner_mutate on public.user_base_traits;
create policy user_base_traits_owner_mutate on public.user_base_traits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_trait_votes: insert guard ensures shared attendance + cooldown
drop policy if exists user_trait_votes_visible_to_participants on public.user_trait_votes;
create policy user_trait_votes_visible_to_participants on public.user_trait_votes
  for select using (auth.uid() = to_user or auth.uid() = from_user);

drop policy if exists user_trait_votes_insert_guard on public.user_trait_votes;
create policy user_trait_votes_insert_guard on public.user_trait_votes
  for insert
  with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.session_attendees r
      where r.session_id = session_id
        and r.user_id = auth.uid()
        and r.status = 'going'
    )
    and exists (
      select 1 from public.session_attendees r2
      where r2.session_id = session_id
        and r2.user_id = to_user
        and r2.status = 'going'
    )
    and exists (
      select 1 from public.sessions s
      where s.id = session_id
        and s.ends_at is not null
        and s.ends_at <= now() - interval '24 hours'
    )
  );

-- user_trait_summary: public readable, no direct writes
drop policy if exists user_trait_summary_public_read on public.user_trait_summary;
create policy user_trait_summary_public_read on public.user_trait_summary for select using (true);

-- 7. Seed initial traits ------------------------------------------------------
insert into public.traits (name, color, icon)
values
  ('Connector', '#0EA5E9', 'Share2'),
  ('Hype Squad', '#F97316', 'Megaphone'),
  ('Zen Master', '#10B981', 'Lotus'),
  ('Adventurous', '#F59E0B', 'Compass'),
  ('Strategist', '#8B5CF6', 'Target'),
  ('Playmaker', '#EC4899', 'Gamepad2'),
  ('Creative Spark', '#06B6D4', 'Sparkles'),
  ('Community Builder', '#14B8A6', 'Users'),
  ('Logistics Pro', '#A855F7', 'ClipboardCheck'),
  ('Good Vibes', '#F43F5E', 'Smile'),
  ('Wildcard', '#6366F1', 'Shuffle'),
  ('Reliable Rock', '#059669', 'ShieldCheck')
on conflict (name) do update set color = excluded.color, icon = excluded.icon;

-- 8. Backfill summary rows for existing base traits (if legacy data exists) ----
insert into public.user_trait_summary (user_id, trait_id, score, base_count, vote_count, updated_at)
select ubt.user_id, ubt.trait_id, 3, 1, 0, now()
from public.user_base_traits ubt
on conflict (user_id, trait_id) do nothing;

-- End migration 021.
