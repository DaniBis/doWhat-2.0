-- Migration 044: Restore user_trait_votes guard to session_attendees
-- Ensures only mutually attended, finished sessions can generate votes

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
    and user_trait_votes.to_user <> auth.uid()
    and exists (
      select 1
      from public.session_attendees sa_voter
      where sa_voter.session_id = user_trait_votes.session_id
        and sa_voter.user_id = auth.uid()
        and sa_voter.attendance_status = 'attended'
    )
    and exists (
      select 1
      from public.session_attendees sa_recipient
      where sa_recipient.session_id = user_trait_votes.session_id
        and sa_recipient.user_id = user_trait_votes.to_user
        and sa_recipient.attendance_status = 'attended'
    )
    and exists (
      select 1
      from public.sessions s
      where s.id = user_trait_votes.session_id
        and s.ends_at is not null
        and s.ends_at <= now()
    )
  );
