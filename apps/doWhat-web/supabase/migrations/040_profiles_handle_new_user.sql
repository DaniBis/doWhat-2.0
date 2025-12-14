-- 040_profiles_handle_new_user.sql
-- Ensure the default auth trigger populates the new user_id column on public.profiles

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, user_id, email)
    values (new.id, new.id, new.email);
    return new;
end;
$$;
