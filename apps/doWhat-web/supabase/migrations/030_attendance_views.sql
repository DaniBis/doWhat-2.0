-- Migration 030: session attendance summary views
-- Adds helper views that expose going/interested counts for sessions,
-- plus rollups per activity and per place so API layers do not need to
-- reimplement these aggregates.

set search_path = public;

-- 1. Per-session attendance counts ----------------------------------------
create or replace view public.v_session_attendance_counts as
  select
    s.id as session_id,
    coalesce(count(sa.*) filter (where sa.status = 'going'), 0)::int as going_count,
    coalesce(count(sa.*) filter (where sa.status = 'interested'), 0)::int as interested_count,
    coalesce(count(sa.*) filter (where sa.status = 'declined'), 0)::int as declined_count,
    coalesce(count(sa.*), 0)::int as total_responses,
    coalesce(max(sa.created_at), s.updated_at, s.created_at) as last_response_at,
    s.activity_id,
    s.venue_id,
    s.starts_at,
    s.ends_at
  from public.sessions s
  left join public.session_attendees sa on sa.session_id = s.id
  group by s.id;

comment on view public.v_session_attendance_counts is
  'Per-session going/interested/declined counts sourced from session_attendees (view).';

-- 2. Activity level rollup -------------------------------------------------
create or replace view public.v_activity_attendance_summary as
  select
    a.id as activity_id,
    coalesce(count(distinct s.id), 0)::int as total_sessions,
    coalesce(count(distinct s.id) filter (where s.starts_at >= now()), 0)::int as upcoming_sessions,
    coalesce(sum(c.going_count), 0)::int as going_count,
    coalesce(sum(c.interested_count), 0)::int as interested_count,
    coalesce(sum(c.total_responses), 0)::int as total_responses,
    max(c.last_response_at) as last_response_at
  from public.activities a
  left join public.sessions s on s.activity_id = a.id
  left join public.v_session_attendance_counts c on c.session_id = s.id
  group by a.id;

comment on view public.v_activity_attendance_summary is
  'Aggregated view that exposes session attendance totals per activity.';

create or replace view public.v_venue_attendance_summary as
  select
    v.id as venue_id,
    coalesce(count(distinct s.id), 0)::int as total_sessions,
    coalesce(count(distinct s.id) filter (where s.starts_at >= now()), 0)::int as upcoming_sessions,
    coalesce(sum(c.going_count), 0)::int as going_count,
    coalesce(sum(c.interested_count), 0)::int as interested_count,
    coalesce(sum(c.total_responses), 0)::int as total_responses,
    max(c.last_response_at) as last_response_at
  from public.venues v
  left join public.sessions s on s.venue_id = v.id
  left join public.v_session_attendance_counts c on c.session_id = s.id
  group by v.id;

comment on view public.v_venue_attendance_summary is
  'Aggregated view that exposes attendance counts for sessions hosted at each venue.';

-- End migration 030.
