-- RLS policies for badges & traits related tables
-- Enable RLS and add baseline policies. Adjust as needed.

-- Badges catalog: readable by all authenticated users
alter table public.badges enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'badges_select_auth' and schemaname = 'public'
	) then
		create policy badges_select_auth on public.badges for select using (auth.role() = 'authenticated');
	end if;
end $$;

-- User badges: owners can read their rows; others can read only verified badges
alter table public.user_badges enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'user_badges_owner_select' and schemaname = 'public'
	) then
		create policy user_badges_owner_select on public.user_badges for select using (auth.uid() = user_id);
	end if;
	if not exists (
		select 1 from pg_policies where policyname = 'user_badges_verified_select' and schemaname = 'public'
	) then
		create policy user_badges_verified_select on public.user_badges for select using (status = 'verified');
	end if;
end $$;
-- Only server/service role should insert/update (no broad policy for mutating by end users here)

-- Badge endorsements: owner (target) can see aggregated via view; keep table restricted (no select)
alter table public.badge_endorsements enable row level security;
-- No select policy (service role only). Allow insert by authenticated (limit one per unique constraint).
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'badge_endorsements_insert' and schemaname = 'public'
	) then
		create policy badge_endorsements_insert on public.badge_endorsements for insert with check (auth.role() = 'authenticated');
	end if;
end $$;

alter table public.user_badge_metrics enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'user_badge_metrics_owner' and schemaname = 'public'
	) then
		create policy user_badge_metrics_owner on public.user_badge_metrics for select using (auth.uid() = user_id);
	end if;
end $$;

-- Traits catalog: readable by all authenticated
alter table public.traits_catalog enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'traits_catalog_select' and schemaname = 'public'
	) then
		create policy traits_catalog_select on public.traits_catalog for select using (auth.role() = 'authenticated');
	end if;
end $$;

-- Trait events: hide raw events from normal users (service role only), so enable RLS but no select policy
alter table public.trait_events enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'trait_events_insert' and schemaname = 'public'
	) then
		create policy trait_events_insert on public.trait_events for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);
	end if;
end $$;

-- Peer agreements: prevent target from seeing endorsers directly; no select, allow insert by authenticated (self not allowed)
alter table public.trait_peer_agreements enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'trait_peer_agreements_insert' and schemaname = 'public'
	) then
		create policy trait_peer_agreements_insert on public.trait_peer_agreements for insert with check (auth.role() = 'authenticated' and auth.uid() = endorser_user_id and auth.uid() <> target_user_id);
	end if;
end $$;

-- User traits materialized scores: owner readable
alter table public.user_traits enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies where policyname = 'user_traits_owner_select' and schemaname = 'public'
	) then
		create policy user_traits_owner_select on public.user_traits for select using (auth.uid() = user_id);
	end if;
end $$;

-- Views inherit base table policies; ensure they remain readable where intended.
-- NOTE: Apply manually via Supabase SQL editor or CLI.
