-- Sign in with username + password (email codes and magic links keep working).
-- Supabase Auth signs in by email, so the client first trades username + password for the
-- account's email here. The email is only returned when the password is right, so this can't be
-- used to look up someone's email. Failed attempts are throttled per username.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.login_attempts (
  username text primary key,
  failures int not null default 0,
  locked_until timestamptz
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

create or replace function public.login_email(p_username text, p_password text)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := lower(trim(coalesce(p_username, '')));
  v_email text;
  v_hash text;
  v_try public.login_attempts;
begin
  if v_name = '' or coalesce(p_password, '') = '' then
    raise exception 'INVALID_LOGIN' using errcode = 'P0001';
  end if;

  select * into v_try from public.login_attempts where username = v_name;
  if v_try.locked_until is not null and v_try.locked_until > now() then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = 'P0001';
  end if;

  select u.email, u.encrypted_password into v_email, v_hash
    from public.profiles p join auth.users u on u.id = p.id
    where p.username = v_name;

  if v_hash is null or v_hash = '' or extensions.crypt(p_password, v_hash) <> v_hash then
    insert into public.login_attempts as a (username, failures) values (v_name, 1)
      on conflict (username) do update set
        failures = case when a.locked_until is not null and a.locked_until <= now() then 1 else a.failures + 1 end,
        locked_until = case
          when (case when a.locked_until is not null and a.locked_until <= now() then 1 else a.failures + 1 end) >= 8
          then now() + interval '15 minutes' end;
    raise exception 'INVALID_LOGIN' using errcode = 'P0001';
  end if;

  delete from public.login_attempts where username = v_name;
  return v_email;
end $$;

revoke execute on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;

-- Lets Settings show "Set password" vs "Change password".
create or replace function public.has_password()
returns boolean language sql security definer stable
set search_path = ''
as $$
  select coalesce(encrypted_password, '') <> '' from auth.users where id = (select auth.uid());
$$;
revoke execute on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;
