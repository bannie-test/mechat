-- Open signup: anyone with an email can create an account (no invite code).
-- The first account is still the admin. The invites table/RPCs are left in place but unused
-- (check_invite is what the keep-alive workflow pings).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
  v_first boolean;
  v_base text;
  v_username text;
begin
  perform pg_advisory_xact_lock(hashtext('iemanchat_signup'));
  v_first := not exists (select 1 from public.profiles);

  v_base := left(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'), 20);
  if char_length(v_base) < 3 then v_base := 'user'; end if;
  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username) loop
    v_username := v_base || floor(random() * 10000)::int;
  end loop;

  insert into public.profiles (id, username, display_name, locale, is_admin)
  values (
    new.id, v_username, left(coalesce(v_name, v_base), 64),
    case when v_locale in ('en', 'vi') then v_locale else 'en' end,
    v_first
  );
  return new;
end $$;
