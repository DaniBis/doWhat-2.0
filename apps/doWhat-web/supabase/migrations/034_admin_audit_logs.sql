-- Migration 034: Admin audit logs + allowlist helpers
create extension if not exists "pgcrypto";

create table if not exists public.admin_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist (email, note)
values ('bisceanudaniel@gmail.com', 'Initial admin allowlist entry (Step 6)')
on conflict (email) do nothing;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;
alter table public.admin_allowlist enable row level security;

create policy admin_allowlist_admins_only
  on public.admin_allowlist for select using (exists (
    select 1 from public.admin_allowlist allow
    where allow.email = auth.jwt() ->> 'email'
  ));

create policy admin_audit_logs_admin_select
  on public.admin_audit_logs for select using (exists (
    select 1 from public.admin_allowlist allow
    where allow.email = auth.jwt() ->> 'email'
  ));

create policy admin_audit_logs_admin_insert
  on public.admin_audit_logs for insert with check (exists (
    select 1 from public.admin_allowlist allow
    where allow.email = auth.jwt() ->> 'email'
  ));
