-- Badges schema for doWhat
-- Categories as an enum to keep data tidy
do $$ begin
  create type public.badge_category as enum (
    'reliability_trust',
    'emotional_warmth',
    'energy_personality',
    'drive_ambition',
    'thinking_cognitive',
    'communication',
    'social_compatibility',
    'balance_self_management',
    'growth_development',
    'distinctive_traits'
  );
exception when duplicate_object then null; end $$;

-- Catalog of badges
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  category public.badge_category not null,
  description text,
  tier int default 1 check(tier >= 1),
  seasonal boolean default false,
  created_at timestamptz default now()
);

-- Endorsements are anonymous to the target user (API only returns counts)
create table if not exists public.badge_endorsements (
  id uuid primary key default uuid_generate_v4(),
  target_user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  endorser_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (target_user_id, badge_id, endorser_user_id)
);

-- User badges and state
do $$ begin
  create type public.badge_status as enum ('unverified','verified','expired');
exception when duplicate_object then null; end $$;

create table if not exists public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  status public.badge_status not null default 'unverified',
  source text not null check (source in ('endorsement','activity','behavior','admin','seasonal')),
  created_at timestamptz default now(),
  verified_at timestamptz,
  expiry_date timestamptz,
  unique (user_id, badge_id)
);

-- Optional metrics to power auto-awards (punctuality, attendance, etc.)
create table if not exists public.user_badge_metrics (
  user_id uuid primary key references public.users(id) on delete cascade,
  events_attended int default 0,
  events_on_time int default 0,
  categories_tried int default 0,
  updated_at timestamptz default now()
);

-- Helpful view: endorsement counts per user+badge
create or replace view public.v_badge_endorsement_counts as
  select target_user_id as user_id, badge_id, count(*) as endorsements
  from public.badge_endorsements
  group by 1,2;

-- Seed a minimal set of badges (can be extended in app)
insert into public.badges (code, name, category, description)
values
  ('reliable','Reliable','reliability_trust','Shows up on time and follows through'),
  ('trustworthy','Trustworthy','reliability_trust','Kept commitments and respected boundaries'),
  ('curious_explorer','Curious Explorer','growth_development','Tried multiple new activity categories'),
  ('consistent','Consistent','reliability_trust','Attended events regularly'),
  ('community_builder','Community Builder','distinctive_traits','Fosters community and supports others')
on conflict (code) do nothing;
