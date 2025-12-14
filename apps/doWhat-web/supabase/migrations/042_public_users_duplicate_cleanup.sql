-- Clean up duplicate public.users entries when ensuring mirrored rows
create or replace function public.ensure_public_user_row(p_user uuid, p_email text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  normalized_email := coalesce(nullif(trim(p_email), ''), concat(p_user::text, '@placeholder.local'));

  delete from public.users where email = normalized_email and id <> p_user;

  insert into public.users (id, email, full_name)
  values (
    p_user,
    normalized_email,
    nullif(trim(p_full_name), '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.users.full_name);
end;
$$;

grant execute on function public.ensure_public_user_row(uuid, text, text) to authenticated;
