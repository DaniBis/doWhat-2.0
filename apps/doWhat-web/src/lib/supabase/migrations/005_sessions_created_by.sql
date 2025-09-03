-- Add created_by on sessions so users can create personal events
alter table if exists public.sessions
  add column if not exists created_by uuid references auth.users(id);

