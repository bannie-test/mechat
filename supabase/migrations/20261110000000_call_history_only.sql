-- Calls keep only their history: when they happened and how long they lasted.
-- Nothing about what happened inside a call (who was in it, who declined) is kept once it ends.

create or replace function public.call__end(p_call uuid, p_status text)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
begin
  update public.calls
    set ended_at = least(now(), heartbeat_at + interval '60 seconds'),
        participants = '{}',
        declined = '{}'
    where id = p_call and ended_at is null
    returning * into v;
  if v.id is null then
    select * into v from public.calls where id = p_call;
    return v;
  end if;
  update public.messages
    set attachment = (coalesce(attachment, '{}'::jsonb) - 'participants') || jsonb_build_object(
      'status', case when v.answered_at is null then coalesce(p_status, 'missed') else 'ended' end,
      'duration', case when v.answered_at is null then 0
                       else greatest(0, floor(extract(epoch from v.ended_at - v.answered_at)))::int end)
    where id = v.message_id;
  return v;
end $$;

-- Leaving a call that already ended (its participant list is gone) is a no-op, not an error.
create or replace function public.end_call(p_call uuid)
returns public.calls language plpgsql security definer
set search_path = ''
as $$
declare
  v public.calls;
begin
  select * into v from public.calls where id = p_call;
  if v.id is null or not public.is_chat_member(v.chat_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v.ended_at is not null then
    return v;
  end if;
  if not ((select auth.uid()) = any (v.participants)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return public.call__end(p_call, 'missed');
end $$;

revoke execute on function public.call__end(uuid, text) from public, anon, authenticated;

-- Scrub what earlier calls kept.
update public.calls set participants = '{}', declined = '{}' where ended_at is not null;
update public.messages set attachment = attachment - 'participants'
  where kind = 'call' and attachment ? 'participants';
