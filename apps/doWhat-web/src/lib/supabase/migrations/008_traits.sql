-- Traits system schema
-- Catalog of traits (name unique), grouped by high-level category
create table if not exists public.traits_catalog (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  category text not null,
  description text,
  created_at timestamptz default now()
);

-- Signals/events contributing to trait scores
do $$ begin
  create type public.trait_source_type as enum ('assessment','behavior','peer');
exception when duplicate_object then null; end $$;

create table if not exists public.trait_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  trait_id uuid not null references public.traits_catalog(id) on delete cascade,
  source_type public.trait_source_type not null,
  delta double precision not null,
  weight double precision not null default 1.0,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists trait_events_user_idx on public.trait_events(user_id);
create index if not exists trait_events_trait_idx on public.trait_events(trait_id);
create index if not exists trait_events_time_idx on public.trait_events(occurred_at);

-- Peer agreements (anonymized to target in API); we store week_start for capping
create table if not exists public.trait_peer_agreements (
  id uuid primary key default uuid_generate_v4(),
  target_user_id uuid not null references public.users(id) on delete cascade,
  trait_id uuid not null references public.traits_catalog(id) on delete cascade,
  endorser_user_id uuid not null references public.users(id) on delete cascade,
  week_start date not null default (date_trunc('week', now()))::date,
  created_at timestamptz default now(),
  unique (target_user_id, trait_id, endorser_user_id, week_start)
);
create index if not exists trait_peer_agreements_target_idx on public.trait_peer_agreements(target_user_id);
create index if not exists trait_peer_agreements_trait_idx on public.trait_peer_agreements(trait_id);

-- Aggregated counts view
create or replace view public.v_trait_peer_agreement_counts as
  select target_user_id as user_id, trait_id, count(*) as agreements
  from public.trait_peer_agreements
  group by 1,2;

-- Materialized scores (nightly recompute updates this)
create table if not exists public.user_traits (
  user_id uuid not null references public.users(id) on delete cascade,
  trait_id uuid not null references public.traits_catalog(id) on delete cascade,
  score_float double precision not null default 50.0,
  confidence_float double precision not null default 0.1,
  last_updated_at timestamptz not null default now(),
  sources_json jsonb not null default '[]'::jsonb,
  primary key (user_id, trait_id)
);
create index if not exists user_traits_score_idx on public.user_traits(trait_id, score_float desc);

-- Seed a minimal subset of traits used by initial signals (can be extended from app)
insert into public.traits_catalog (name, category, description)
values
  ('Reliable','Core Reliability','Shows up and follows through'),
  ('Trustworthy','Core Reliability','Keeps commitments and respects boundaries'),
  ('Consistent','Core Reliability','Regular behavior over time'),
  ('Punctual','Conscientious Execution','Arrives on time'),
  ('Organized','Conscientious Execution','Keeps plans and details in order'),
  ('Curious','Openness & Curiosity','Interested in exploring and learning'),
  ('Open-minded','Openness & Curiosity','Considers diverse perspectives')
on conflict (name) do nothing;

-- Optional: simple helper to upsert user_traits row if missing
create or replace function public.ensure_user_trait_row(p_user uuid, p_trait uuid)
returns void language plpgsql as $$
begin
  insert into public.user_traits(user_id, trait_id)
  values (p_user, p_trait)
  on conflict (user_id, trait_id) do nothing;
end; $$;

-- Notes:
-- - Add RLS policies if desired; API already enforces auth/owner/admin checks
-- - Schedule nightly recompute via job runner calling API or a SQL procedure
