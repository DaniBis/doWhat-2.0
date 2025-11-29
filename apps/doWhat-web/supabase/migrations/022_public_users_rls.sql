-- Ensure authenticated users can manage their mirror row in public.users
alter table if exists public.users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Users manage own mirror row'
  ) then
    create policy "Users manage own mirror row" on public.users
      for all
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end;
$$;

create or replace function public.ensure_public_user_row(p_user uuid, p_email text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    p_user,
    coalesce(nullif(trim(p_email), ''), concat(p_user::text, '@placeholder.local')),
    nullif(trim(p_full_name), '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.users.full_name);
end;
$$;

grant execute on function public.ensure_public_user_row(uuid, text, text) to authenticated;
