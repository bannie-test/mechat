-- Voice & video calls.
-- Media goes peer-to-peer (WebRTC, small mesh of up to 6 people); signaling uses a Supabase
-- Realtime channel named "call:<id>". This table tells chat members a call exists (ringing,
-- "join" banners) and each call leaves a log message (kind 'call') in the chat.

-- 1) Call log messages. Only the RPCs below may create them.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'file', 'voice', 'sticker', 'gif', 'system', 'call'));

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and kind not in ('system', 'call') and public.is_chat_member(chat_id));

-- 2) Calls
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  started_by uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('voice', 'video')),
  message_id uuid references public.messages (id) on delete set null,
  participants uuid[] not null default '{}',   -- everyone who joined at some point
  declined uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  answered_at timestamptz,                     -- first time someone other than the caller joined
  ended_at timestamptz,
  heartbeat_at timestamptz not null default now()  -- kept fresh while anyone is in the call
);
create index calls_chat_active_idx on public.calls (chat_id) where ended_at is null;

alter table public.calls enable row level security;
create policy calls_select on public.calls for select to authenticated
  using (public.is_chat_member(chat_id));
revoke all on public.calls from anon, authenticated;
grant select on public.calls to authenticated;

alter publication supabase_realtime add table public.calls;

-- Close a call and finish its log message. p_status is used when nobody answered
-- ('missed' or 'declined'); answered calls always end as 'ended' with a duration.
create or replace function public.call__end(p_call uuid, p_status text)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
begin
  update public.calls
    set ended_at = least(now(), heartbeat_at + interval '60 seconds')
    where id = p_call and ended_at is null
    returning * into v;
  if v.id is null then
    select * into v from public.calls where id = p_call;
    return v;
  end if;
  update public.messages
    set attachment = coalesce(attachment, '{}'::jsonb) || jsonb_build_object(
      'status', case when v.answered_at is null then coalesce(p_status, 'missed') else 'ended' end,
      'duration', case when v.answered_at is null then 0
                       else greatest(0, floor(extract(epoch from v.ended_at - v.answered_at)))::int end,
      'participants', to_jsonb(v.participants))
    where id = v.message_id;
  return v;
end $$;

-- Start a call, or join the one already going on in this chat.
create or replace function public.start_call(p_chat uuid, p_kind text)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
  v_me uuid := auth.uid();
  v_msg uuid;
begin
  if v_me is null or not public.is_chat_member(p_chat) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;
  if p_kind not in ('voice', 'video') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('call:' || p_chat::text));

  select * into v from public.calls
    where chat_id = p_chat and ended_at is null and heartbeat_at > now() - interval '90 seconds'
    order by started_at desc limit 1;
  if v.id is not null then
    return v;
  end if;

  -- Calls nobody kept alive (everyone closed the app mid-call).
  perform public.call__end(c.id, 'missed')
    from public.calls c where c.chat_id = p_chat and c.ended_at is null;

  insert into public.calls (chat_id, started_by, kind, participants)
    values (p_chat, v_me, p_kind, array[v_me])
    returning * into v;
  insert into public.messages (chat_id, sender_id, kind, attachment)
    values (p_chat, v_me, 'call', jsonb_build_object('call_id', v.id, 'call_kind', p_kind, 'status', 'ringing'))
    returning id into v_msg;
  update public.calls set message_id = v_msg where id = v.id returning * into v;
  return v;
end $$;

create or replace function public.answer_call(p_call uuid)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
  v_me uuid := auth.uid();
begin
  select * into v from public.calls where id = p_call for update;
  if v.id is null or not public.is_chat_member(v.chat_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v.ended_at is not null then
    raise exception 'CALL_ENDED' using errcode = 'P0001';
  end if;
  update public.calls set
      answered_at = coalesce(answered_at, case when v_me is distinct from started_by then now() end),
      participants = case when v_me = any (participants) then participants else participants || v_me end,
      heartbeat_at = now()
    where id = p_call
    returning * into v;
  if v.answered_at is not null then
    update public.messages set attachment = attachment || '{"status": "ongoing"}'
      where id = v.message_id and attachment ->> 'status' = 'ringing';
  end if;
  return v;
end $$;

-- Decline ringing. In a 1:1 chat this ends the call; in a group it only stops your ringing.
create or replace function public.decline_call(p_call uuid)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
  v_me uuid := auth.uid();
begin
  select * into v from public.calls where id = p_call for update;
  if v.id is null or not public.is_chat_member(v.chat_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v.ended_at is not null then
    return v;
  end if;
  update public.calls
    set declined = case when v_me = any (declined) then declined else declined || v_me end
    where id = p_call
    returning * into v;
  if v.answered_at is null and (select type from public.chats where id = v.chat_id) = 'direct' then
    v := public.call__end(p_call, 'declined');
  end if;
  return v;
end $$;

-- Called every ~25 s by one participant so stale calls can be detected.
create or replace function public.call_heartbeat(p_call uuid)
returns void language sql security definer
set search_path = ''
as $$
  update public.calls set heartbeat_at = now()
    where id = p_call and ended_at is null and (select auth.uid()) = any (participants);
$$;

-- The last person to leave (or the caller cancelling) closes the call.
create or replace function public.end_call(p_call uuid)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
begin
  select * into v from public.calls where id = p_call;
  if v.id is null or not public.is_chat_member(v.chat_id) or not ((select auth.uid()) = any (v.participants)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return public.call__end(p_call, 'missed');
end $$;

revoke execute on function public.call__end(uuid, text) from public, anon, authenticated;
revoke execute on function
  public.start_call(uuid, text), public.answer_call(uuid), public.decline_call(uuid),
  public.call_heartbeat(uuid), public.end_call(uuid)
from public, anon;
grant execute on function
  public.start_call(uuid, text), public.answer_call(uuid), public.decline_call(uuid),
  public.call_heartbeat(uuid), public.end_call(uuid)
to authenticated;
