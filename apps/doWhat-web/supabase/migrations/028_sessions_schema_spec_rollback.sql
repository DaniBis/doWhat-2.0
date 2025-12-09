-- Rollback for migration 028: restore previous constraint behavior

-- Revert sessions foreign keys to their earlier cascade / set-null behavior
alter table if exists public.sessions drop constraint if exists sessions_venue_id_fkey;
alter table if exists public.sessions
  add constraint sessions_venue_id_fkey foreign key (venue_id)
  references public.venues(id) on delete set null;

alter table if exists public.sessions drop constraint if exists sessions_activity_id_fkey;
alter table if exists public.sessions
  add constraint sessions_activity_id_fkey foreign key (activity_id)
  references public.activities(id) on delete set null;

alter table if exists public.sessions drop constraint if exists sessions_host_user_id_fkey;
alter table if exists public.sessions
  add constraint sessions_host_user_id_fkey foreign key (host_user_id)
  references public.profiles(user_id) on delete cascade;

alter table if exists public.sessions
  alter column host_user_id drop not null;

-- Restore session_attendees indexes removed by the forward migration
create index if not exists session_attendees_user_idx on public.session_attendees(user_id);
create index if not exists session_attendees_status_idx on public.session_attendees(status);

-- Re-enable cascade deletes for session_attendees foreign keys
alter table if exists public.session_attendees drop constraint if exists session_attendees_session_id_fkey;
alter table if exists public.session_attendees
  add constraint session_attendees_session_id_fkey foreign key (session_id)
  references public.sessions(id) on delete cascade;

alter table if exists public.session_attendees drop constraint if exists session_attendees_user_id_fkey;
alter table if exists public.session_attendees
  add constraint session_attendees_user_id_fkey foreign key (user_id)
  references public.profiles(user_id) on delete cascade;
