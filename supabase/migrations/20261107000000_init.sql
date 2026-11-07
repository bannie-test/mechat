-- iemanchat core schema
-- Everything a client can do is guarded by RLS or by SECURITY DEFINER RPCs below.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Accent-insensitive helper (Vietnamese "Tiếng Việt" matches "tieng viet").
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_url text,
  bio text check (char_length(bio) <= 200),
  is_admin boolean not null default false,
  locale text not null default 'en' check (locale in ('en', 'vi')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invites (signup is invite-only; the very first user bootstraps as admin)
-- ---------------------------------------------------------------------------
create table public.invites (
  code text primary key,
  created_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 100),
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
  v_first boolean;
  v_base text;
  v_username text;
begin
  perform pg_advisory_xact_lock(hashtext('iemanchat_signup'));
  v_first := not exists (select 1 from public.profiles);

  if not v_first then
    perform 1 from public.invites
      where code = v_code and used_by is null and expires_at > now()
      for update;
    if not found then
      raise exception 'INVITE_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

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

  if not v_first then
    update public.invites set used_by = new.id, used_at = now() where code = v_code;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Chats & members
-- ---------------------------------------------------------------------------
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text check (char_length(title) <= 64),
  avatar_url text,
  direct_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (chat_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create or replace function public.is_chat_member(p_chat uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = p_chat and user_id = (select auth.uid())
  )
$$;

-- Storage paths look like "<chat_id>/<file>"; safe even for malformed names.
create or replace function public.is_chat_member_path(p_name text)
returns boolean language plpgsql stable security definer
set search_path = ''
as $$
declare v_first text := split_part(p_name, '/', 1);
begin
  if v_first !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_chat_member(v_first::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- Messages & reactions
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'text'
    check (kind in ('text', 'image', 'file', 'voice', 'sticker', 'gif', 'system')),
  content text check (char_length(content) <= 4096),
  attachment jsonb,
  reply_to_id uuid references public.messages (id) on delete set null,
  forwarded_from jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index messages_chat_created_idx on public.messages (chat_id, created_at desc);
create index messages_search_idx on public.messages
  using gin (public.f_unaccent(lower(content)) extensions.gin_trgm_ops)
  where deleted_at is null;

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create or replace function public.messages_before_write()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    if new.reply_to_id is not null and not exists (
      select 1 from public.messages where id = new.reply_to_id and chat_id = new.chat_id
    ) then
      new.reply_to_id := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.deleted_at is not null then
    raise exception 'MESSAGE_DELETED' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.content := null;
    new.attachment := null;
  elsif new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger messages_before_write
  before insert or update on public.messages
  for each row execute function public.messages_before_write();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  if new.sender_id is not null then
    update public.chat_members set last_read_at = new.created_at
      where chat_id = new.chat_id and user_id = new.sender_id;
  end if;

  if new.kind <> 'system' then
    -- Web push via Edge Function. Configure once with vault secrets (see README).
    begin
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
      if v_url is not null and v_secret is not null then
        perform net.http_post(
          url := v_url || '/functions/v1/push',
          body := jsonb_build_object('message_id', new.id),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
        );
      end if;
    exception when others then
      raise warning 'push notify skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Mini apps registry
-- ---------------------------------------------------------------------------
create table public.mini_apps (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  name jsonb not null,                       -- {"en": "...", "vi": "..."}
  description jsonb not null default '{}',
  icon text,                                 -- emoji or image URL
  url text not null,                         -- where the bundle's index.html lives
  enabled boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.mini_apps enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy invites_select on public.invites for select to authenticated
  using (created_by = (select auth.uid()));
create policy invites_delete on public.invites for delete to authenticated
  using (created_by = (select auth.uid()) and used_by is null);

create policy chats_select on public.chats for select to authenticated
  using (public.is_chat_member(id));
create policy chats_update on public.chats for update to authenticated
  using (type = 'group' and public.is_chat_member(id))
  with check (type = 'group' and public.is_chat_member(id));

create policy members_select on public.chat_members for select to authenticated
  using (public.is_chat_member(chat_id));
create policy members_update_self on public.chat_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy messages_select on public.messages for select to authenticated
  using (public.is_chat_member(chat_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and kind <> 'system' and public.is_chat_member(chat_id));
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

create policy reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
create policy reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id));
create policy reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy push_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy mini_apps_select on public.mini_apps for select to authenticated using (enabled);

-- Column-level write privileges (RLS decides rows, grants decide columns).
revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
grant update (username, display_name, avatar_url, bio, locale) on public.profiles to authenticated;
grant delete on public.invites to authenticated;
grant update (title, avatar_url) on public.chats to authenticated;
grant update (last_read_at, muted) on public.chat_members to authenticated;
grant insert (id, chat_id, sender_id, kind, content, attachment, reply_to_id, forwarded_from)
  on public.messages to authenticated;
grant update (content, edited_at, deleted_at, attachment) on public.messages to authenticated;
grant insert, delete on public.message_reactions to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.check_invite(p_code text)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles)
      or exists (select 1 from public.invites
                 where code = upper(trim(p_code)) and used_by is null and expires_at > now())
$$;

create or replace function public.create_invite(p_note text default null)
returns public.invites language plpgsql security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_row public.invites;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, created_by, note)
    values (v_code, auth.uid(), nullif(trim(p_note), ''))
    returning * into v_row;
  return v_row;
end $$;

create or replace function public.get_my_chats()
returns table (
  id uuid, type text, title text, avatar_url text,
  created_at timestamptz, last_message_at timestamptz,
  muted boolean, last_read_at timestamptz,
  peer_id uuid, member_count int, unread_count int, last_message jsonb
)
language sql stable security invoker
set search_path = ''
as $$
  select
    c.id, c.type, c.title, c.avatar_url, c.created_at, c.last_message_at,
    me.muted, me.last_read_at,
    case when c.type = 'direct' then (
      select cm.user_id from public.chat_members cm
      where cm.chat_id = c.id and cm.user_id <> (select auth.uid()) limit 1
    ) end,
    (select count(*)::int from public.chat_members cm where cm.chat_id = c.id),
    (select count(*)::int from public.messages m
      where m.chat_id = c.id and m.created_at > me.last_read_at
        and m.sender_id is distinct from (select auth.uid())
        and m.deleted_at is null and m.kind <> 'system'),
    (select to_jsonb(m) from public.messages m
      where m.chat_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1)
  from public.chats c
  join public.chat_members me on me.chat_id = c.id and me.user_id = (select auth.uid())
  order by c.last_message_at desc
$$;

create or replace function public.post_system_message(p_chat uuid, p_event text, p_data jsonb)
returns void language sql security definer
set search_path = ''
as $$
  insert into public.messages (chat_id, sender_id, kind, content, attachment)
  values (p_chat, auth.uid(), 'system', p_event, p_data)
$$;
revoke execute on function public.post_system_message(uuid, text, jsonb) from public;

create or replace function public.create_direct_chat(p_other uuid)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_other = v_me or not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'INVALID_USER';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select id into v_id from public.chats where direct_key = v_key;
  if v_id is null then
    insert into public.chats (type, direct_key, created_by) values ('direct', v_key, v_me)
      returning id into v_id;
    insert into public.chat_members (chat_id, user_id, role)
      values (v_id, v_me, 'member'), (v_id, p_other, 'member');
  end if;
  return v_id;
end $$;

create or replace function public.create_group_chat(p_title text, p_members uuid[])
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  insert into public.chats (type, title, created_by) values ('group', left(trim(p_title), 64), v_me)
    returning id into v_id;
  insert into public.chat_members (chat_id, user_id, role) values (v_id, v_me, 'owner');
  insert into public.chat_members (chat_id, user_id)
    select v_id, p.id from public.profiles p
    where p.id = any (p_members) and p.id <> v_me
    on conflict do nothing;
  perform public.post_system_message(v_id, 'group_created', jsonb_build_object('title', trim(p_title)));
  return v_id;
end $$;

create or replace function public.add_chat_members(p_chat uuid, p_members uuid[])
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_added uuid[];
begin
  if not exists (select 1 from public.chats where id = p_chat and type = 'group')
     or not public.is_chat_member(p_chat) then
    raise exception 'FORBIDDEN';
  end if;
  with ins as (
    insert into public.chat_members (chat_id, user_id)
      select p_chat, p.id from public.profiles p where p.id = any (p_members)
      on conflict do nothing
      returning user_id
  ) select array_agg(user_id) into v_added from ins;
  if v_added is not null then
    perform public.post_system_message(p_chat, 'members_added', jsonb_build_object('user_ids', to_jsonb(v_added)));
  end if;
end $$;

create or replace function public.leave_chat(p_chat uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.chats where id = p_chat and type = 'group')
     or not public.is_chat_member(p_chat) then
    raise exception 'FORBIDDEN';
  end if;
  perform public.post_system_message(p_chat, 'member_left', '{}'::jsonb);
  delete from public.chat_members where chat_id = p_chat and user_id = auth.uid();
  if not exists (select 1 from public.chat_members where chat_id = p_chat) then
    delete from public.chats where id = p_chat;
  end if;
end $$;

create or replace function public.search_messages(p_query text, p_chat uuid default null, p_limit int default 50)
returns setof public.messages
language sql stable security invoker
set search_path = ''
as $$
  select m.* from public.messages m
  where m.deleted_at is null
    and m.kind = 'text'
    and (p_chat is null or m.chat_id = p_chat)
    and char_length(trim(p_query)) >= 2
    and public.f_unaccent(lower(m.content)) like
        '%' || replace(replace(replace(public.f_unaccent(lower(trim(p_query))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- Uses server time so clock skew on a phone can't leave messages "unread".
create or replace function public.mark_read(p_chat uuid)
returns timestamptz language sql security definer
set search_path = ''
as $$
  update public.chat_members set last_read_at = now()
  where chat_id = p_chat and user_id = auth.uid()
  returning last_read_at
$$;

create or replace function public.touch_last_seen()
returns void language sql security definer
set search_path = ''
as $$ update public.profiles set last_seen_at = now() where id = auth.uid() $$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end $$;

-- Function privileges: nothing for anon except check_invite.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.post_system_message(uuid, text, jsonb) from authenticated;
grant execute on function public.check_invite(text) to anon;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400),  -- 25 MB, private, per-chat folders
       ('avatars', 'avatars', true, 5242880)             -- 5 MB, public, per-user folders
on conflict (id) do nothing;

create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_chat_member_path(name));
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_chat_member_path(name));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = (select auth.uid())::text);

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.messages, public.message_reactions, public.chat_members, public.chats, public.profiles;
