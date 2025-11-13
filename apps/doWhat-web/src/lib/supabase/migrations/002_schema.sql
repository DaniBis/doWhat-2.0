-- Core schema for doWhat app
-- This replaces the old example schema with the actual tables needed by the app

-- Activities table
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Venues table
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

-- Sessions table (events/activities at specific times)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete cascade not null,
  venue_id uuid references public.venues(id) on delete cascade not null,
  price_cents integer,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- RSVPs table
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  status text check (status in ('going', 'interested', 'declined')) not null,
  created_at timestamptz default now(),
  unique(activity_id, user_id)
);

-- Indexes for better performance
create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
create index if not exists sessions_activity_id_idx on public.sessions(activity_id);
create index if not exists sessions_venue_id_idx on public.sessions(venue_id);
create index if not exists rsvps_activity_id_idx on public.rsvps(activity_id);
create index if not exists rsvps_user_id_idx on public.rsvps(user_id);
create index if not exists venues_lat_lng_idx on public.venues(lat, lng) where lat is not null and lng is not null;

-- Optional RLS policies (uncomment if needed)
-- alter table public.activities enable row level security;
-- alter table public.venues enable row level security;
-- alter table public.sessions enable row level security;
-- alter table public.rsvps enable row level security;

-- Example RLS policy: Anyone can read, authenticated users can insert/update/delete
-- create policy "Public activities read" on public.activities for select using (true);
-- create policy "Authenticated activities write" on public.activities for all using (auth.uid() is not null);

