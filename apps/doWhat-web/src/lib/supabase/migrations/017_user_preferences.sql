create table if not exists public.user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idx_user_preferences_user_id on public.user_preferences(user_id);
create index if not exists idx_user_preferences_key on public.user_preferences(key);

alter table public.user_preferences enable row level security;

create policy if not exists "Users manage own preferences" on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.set_updated_at();
