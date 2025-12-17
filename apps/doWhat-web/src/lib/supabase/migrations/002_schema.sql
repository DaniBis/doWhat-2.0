-- Create users table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  full_name text,
  created_at timestamp with time zone default now()
);

-- Create activities table
create table if not exists public.activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users (id) on delete cascade,
  title text not null,
  description text,
  location text,
  date timestamptz,
  created_at timestamp with time zone default now()
);
