-- Profiles table (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- Index for quick lookups
create index if not exists profiles_updated_at_idx on public.profiles(updated_at desc);

-- RLS (optional):
-- enable row level security if your project uses it and add policies:
-- alter table public.profiles enable row level security;
-- create policy "profile_select_own" on public.profiles for select using (auth.uid() = id);
-- create policy "profile_upsert_own" on public.profiles for insert with check (auth.uid() = id);
-- create policy "profile_update_own" on public.profiles for update using (auth.uid() = id);

