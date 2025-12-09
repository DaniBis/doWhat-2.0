-- Migration 032: Harden trait vote guard + RPC privileges

-- Replace user_trait_votes policy so both the voter and recipient must share
-- a "going" RSVP and the session must have fully completed.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_trait_votes'
      and policyname = 'user_trait_votes_insert_guard'
  ) then
    drop policy user_trait_votes_insert_guard on public.user_trait_votes;
  end if;
end$$;

create policy user_trait_votes_insert_guard on public.user_trait_votes
  for insert
  with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.rsvps r
      where r.session_id = user_trait_votes.session_id
        and r.user_id = auth.uid()
        and r.status = 'going'
    )
    and exists (
      select 1 from public.rsvps r2
      where r2.session_id = user_trait_votes.session_id
        and r2.user_id = user_trait_votes.to_user
        and r2.status = 'going'
    )
    and exists (
      select 1 from public.sessions s
      where s.id = user_trait_votes.session_id
        and s.ends_at is not null
        and s.ends_at <= now() - interval '24 hours'
    )
  );

-- Ensure increment_user_trait_score is callable only by authenticated/service
-- roles; anonymous callers should not mutate summary rows.
revoke execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) from public;
revoke execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) from anon;

grant execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) to authenticated;
grant execute on function public.increment_user_trait_score(uuid, uuid, integer, integer, integer) to service_role;
