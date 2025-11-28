-- 018_activity_taxonomy.sql
-- Creates hierarchical activity taxonomy storage plus helpers

create table if not exists public.activity_categories (
  id text primary key,
  tier smallint not null check (tier between 1 and 3),
  label text not null,
  description text not null,
  parent_id text references public.activity_categories(id) on delete cascade,
  icon_key text,
  color_token text,
  tags text[] not null default '{}',
  weight smallint not null default 0,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((tier = 1 and parent_id is null) or (tier > 1 and parent_id is not null))
);

create index if not exists activity_categories_parent_idx on public.activity_categories(parent_id);
create index if not exists activity_categories_tier_idx on public.activity_categories(tier);
create index if not exists activity_categories_tags_idx on public.activity_categories using gin(tags);

create or replace function public.fn_touch_activity_categories()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists activity_categories_touch on public.activity_categories;
create trigger activity_categories_touch
before update on public.activity_categories
for each row
execute procedure public.fn_touch_activity_categories();

create table if not exists public.activity_taxonomy_state (
  id int primary key default 1 check (id = 1),
  version text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.fn_touch_activity_taxonomy_state()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists activity_taxonomy_state_touch on public.activity_taxonomy_state;
create trigger activity_taxonomy_state_touch
before update on public.activity_taxonomy_state
for each row
execute procedure public.fn_touch_activity_taxonomy_state();

create or replace view public.v_activity_taxonomy_flat as
select
  tier3.id as tier3_id,
  tier3.label as tier3_label,
  tier3.description as tier3_description,
  tier3.tags as tier3_tags,
  tier3.weight as tier3_weight,
  tier2.id as tier2_id,
  tier2.label as tier2_label,
  tier2.description as tier2_description,
  tier2.tags as tier2_tags,
  tier1.id as tier1_id,
  tier1.label as tier1_label,
  tier1.description as tier1_description,
  tier1.tags as tier1_tags,
  tier1.icon_key as tier1_icon_key,
  tier1.color_token as tier1_color_token
from public.activity_categories tier3
left join public.activity_categories tier2 on tier3.parent_id = tier2.id
left join public.activity_categories tier1 on tier2.parent_id = tier1.id
where tier3.tier = 3;

alter table public.activity_categories enable row level security;
alter table public.activity_taxonomy_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_categories'
      and policyname = 'Activity categories read'
  ) then
    create policy "Activity categories read" on public.activity_categories for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_taxonomy_state'
      and policyname = 'Activity taxonomy state read'
  ) then
    create policy "Activity taxonomy state read" on public.activity_taxonomy_state for select using (true);
  end if;
end $$;
