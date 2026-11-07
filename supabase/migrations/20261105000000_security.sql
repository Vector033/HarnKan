-- Hardening, 2026-11-05.
--
-- * The trip creator can lock a trip to new members and replace the invite
--   code, so a link that leaked out of the group stops working.
-- * The creator can remove a member; a removed member loses access at once.
-- * A placeholder (someone added by name who has not joined) can no longer
--   carry a PromptPay id or payee name. Otherwise any member could set a
--   placeholder's PromptPay to their own number and collect that friend's
--   money; people now enter their own when they join.
-- * Trip creation is rate limited per user.

alter table public.trips add column locked boolean not null default false;

-- Size caps so no client can store arbitrary blobs through the jsonb columns.
alter table public.expenses add constraint expenses_split_size check (pg_column_size(split) <= 8192);
alter table public.payments add constraint payments_slip_size check (slip is null or pg_column_size(slip) <= 2048);

-- A trip is a group of friends, not a broadcast list.
create function public.trip_has_room(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.members m where m.trip_id = t) < 50;
$$;

-- Existing placeholders lose any payment details someone else typed for them.
update public.members set promptpay_id = null, payee_name = null where user_id is null;

drop policy "members add placeholders" on public.members;
create policy "members add placeholders" on public.members
  for insert to authenticated
  with check (
    public.is_trip_member(trip_id) and public.trip_has_room(trip_id)
    and user_id is null and promptpay_id is null and payee_name is null
  );

drop policy "edit own row or a placeholder" on public.members;
create policy "edit own row or a placeholder" on public.members
  for update to authenticated
  using (public.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())))
  with check (
    public.is_trip_member(trip_id)
    and (
      user_id = (select auth.uid())
      or (user_id is null and promptpay_id is null and payee_name is null)
    )
  );

create function public.require_creator(t uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_member(t);
  if not exists (select 1 from public.trips where id = t and created_by = (select auth.uid())) then
    raise exception 'not_creator' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_trip(p_name text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_trip uuid;
  v_member uuid;
  v_code text := public.new_invite_code();
begin
  if (select count(*) from public.trips where created_by = v_user and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.trips (name, invite_code, created_by)
  values (btrim(p_name), v_code, v_user)
  returning id into v_trip;

  insert into public.members (trip_id, user_id, nickname)
  values (v_trip, v_user, btrim(p_nickname))
  returning id into v_member;

  return jsonb_build_object('trip_id', v_trip, 'member_id', v_member, 'invite_code', v_code);
end;
$$;

-- A locked trip shows only its name, so a stray link reveals no one's nickname.
create or replace function public.trip_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'locked', t.locked,
    'already_member', exists (
      select 1 from public.members m where m.trip_id = t.id and m.user_id = (select auth.uid())
    ),
    'members', case when t.locked then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nickname', m.nickname, 'claimed', m.user_id is not null)
                       order by m.created_at)
      from public.members m where m.trip_id = t.id
    ), '[]'::jsonb) end
  )
  from public.trips t
  where t.invite_code = lower(btrim(p_code));
$$;

create or replace function public.join_trip(p_code text, p_nickname text default null, p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_trip uuid;
  v_locked boolean;
  v_member uuid;
begin
  select id, locked into v_trip, v_locked from public.trips where invite_code = lower(btrim(p_code));
  if v_trip is null then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  select id into v_member from public.members where trip_id = v_trip and user_id = v_user;
  if v_member is not null then
    return jsonb_build_object('trip_id', v_trip, 'member_id', v_member);
  end if;
  if v_locked then
    raise exception 'trip_locked' using errcode = 'P0001';
  end if;

  if p_member_id is not null then
    update public.members set user_id = v_user
    where id = p_member_id and trip_id = v_trip and user_id is null
    returning id into v_member;
    if v_member is null then
      raise exception 'member_already_claimed' using errcode = 'P0001';
    end if;
  else
    if not public.trip_has_room(v_trip) then
      raise exception 'trip_full' using errcode = 'P0001';
    end if;
    begin
      insert into public.members (trip_id, user_id, nickname)
      values (v_trip, v_user, btrim(p_nickname))
      returning id into v_member;
    exception when unique_violation then
      raise exception 'nickname_taken' using errcode = 'P0001';
    end;
  end if;

  return jsonb_build_object('trip_id', v_trip, 'member_id', v_member);
end;
$$;

create function public.set_trip_locked(p_trip uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_creator(p_trip);
  update public.trips set locked = p_locked where id = p_trip;
end;
$$;

-- Replaces the invite code; every link shared before stops working.
create function public.rotate_invite(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.new_invite_code();
begin
  perform public.require_creator(p_trip);
  update public.trips set invite_code = v_code where id = p_trip;
  return v_code;
end;
$$;

-- Takes a member out of the trip. Someone who appears in expenses or payments
-- stays as a placeholder name so the numbers still add up, but their account
-- and payment details are detached; anyone else is deleted.
create function public.remove_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_user uuid;
begin
  select trip_id, user_id into v_trip, v_user from public.members where id = p_member;
  if v_trip is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.require_creator(v_trip);
  if v_user = (select auth.uid()) then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.expenses e where e.trip_id = v_trip and (e.paid_by = p_member or e.split ? p_member::text))
     or exists (select 1 from public.payments p where p.from_member = p_member or p.to_member = p_member) then
    update public.members set user_id = null, promptpay_id = null, payee_name = null where id = p_member;
  else
    delete from public.members where id = p_member;
  end if;
end;
$$;

revoke execute on function public.require_creator(uuid) from public, anon;
revoke execute on function public.trip_has_room(uuid) from public, anon;
grant execute on function public.trip_has_room(uuid) to authenticated;
grant execute on function
  public.set_trip_locked(uuid, boolean),
  public.rotate_invite(uuid),
  public.remove_member(uuid)
to authenticated;
revoke execute on function public.set_trip_locked(uuid, boolean), public.rotate_invite(uuid), public.remove_member(uuid)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Second pass, after an independent review (2026-11-07)
-- ---------------------------------------------------------------------------

-- Invite links expire: a link pasted in a group chat months ago should not
-- still let people in. Creating a new link or reopening the trip resets it.
alter table public.trips add column invite_expires_at timestamptz not null default now() + interval '7 days';

-- Someone the creator removed cannot simply rejoin, with any link.
create table public.trip_bans (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
alter table public.trip_bans enable row level security;
revoke all on public.trip_bans from anon, authenticated;

-- Claiming a placeholder ("I am Ton") waits for the creator to approve.
-- Without this, anyone holding the link could become Ton, set their own
-- PromptPay, and collect what the group owes Ton.
alter table public.members add column pending_user_id uuid references auth.users (id) on delete set null;

-- Members can delete a placeholder only when nothing refers to it; otherwise
-- deleting it would silently change everyone's shares.
drop policy "remove unused placeholders" on public.members;
create policy "remove unused placeholders" on public.members
  for delete to authenticated using (
    public.is_trip_member(trip_id) and user_id is null
    and not exists (
      select 1 from public.expenses e
      where e.trip_id = members.trip_id and (e.paid_by = members.id or e.split ? members.id::text)
    )
    and not exists (select 1 from public.payments p where p.from_member = members.id or p.to_member = members.id)
  );

create or replace function public.trip_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'locked', t.locked or t.invite_expires_at < now(),
    'already_member', exists (
      select 1 from public.members m where m.trip_id = t.id and m.user_id = (select auth.uid())
    ),
    'pending_member', (
      select m.id from public.members m where m.trip_id = t.id and m.pending_user_id = (select auth.uid()) limit 1
    ),
    'members', case when t.locked or t.invite_expires_at < now() then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nickname', m.nickname,
                                          'claimed', m.user_id is not null or m.pending_user_id is not null)
                       order by m.created_at)
      from public.members m where m.trip_id = t.id
    ), '[]'::jsonb) end
  )
  from public.trips t
  where t.invite_code = lower(btrim(p_code));
$$;

create or replace function public.join_trip(p_code text, p_nickname text default null, p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_trip uuid;
  v_closed boolean;
  v_member uuid;
begin
  select id, locked or invite_expires_at < now() into v_trip, v_closed
  from public.trips where invite_code = lower(btrim(p_code));
  if v_trip is null then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  select id into v_member from public.members where trip_id = v_trip and user_id = v_user;
  if v_member is not null then
    return jsonb_build_object('trip_id', v_trip, 'member_id', v_member, 'status', 'member');
  end if;
  if v_closed or exists (select 1 from public.trip_bans where trip_id = v_trip and user_id = v_user) then
    raise exception 'trip_locked' using errcode = 'P0001';
  end if;

  if p_member_id is not null then
    -- One pending claim per person per trip.
    update public.members set pending_user_id = null where trip_id = v_trip and pending_user_id = v_user;
    update public.members set pending_user_id = v_user
    where id = p_member_id and trip_id = v_trip and user_id is null and pending_user_id is null
    returning id into v_member;
    if v_member is null then
      raise exception 'member_already_claimed' using errcode = 'P0001';
    end if;
    return jsonb_build_object('trip_id', v_trip, 'member_id', v_member, 'status', 'pending');
  end if;

  if not public.trip_has_room(v_trip) then
    raise exception 'trip_full' using errcode = 'P0001';
  end if;
  begin
    insert into public.members (trip_id, user_id, nickname)
    values (v_trip, v_user, btrim(p_nickname))
    returning id into v_member;
  exception when unique_violation then
    raise exception 'nickname_taken' using errcode = 'P0001';
  end;
  return jsonb_build_object('trip_id', v_trip, 'member_id', v_member, 'status', 'member');
end;
$$;

-- The creator approves or turns down a claim on a placeholder.
create function public.decide_claim(p_member uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_pending uuid;
begin
  select trip_id, pending_user_id into v_trip, v_pending from public.members where id = p_member;
  if v_trip is null or v_pending is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.require_creator(v_trip);
  if p_accept and not exists (select 1 from public.members where trip_id = v_trip and user_id = v_pending) then
    update public.members set user_id = v_pending, pending_user_id = null where id = p_member and user_id is null;
  else
    update public.members set pending_user_id = null where id = p_member;
  end if;
end;
$$;

create or replace function public.set_trip_locked(p_trip uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_creator(p_trip);
  update public.trips
  set locked = p_locked,
      invite_expires_at = case when p_locked then invite_expires_at else now() + interval '7 days' end
  where id = p_trip;
end;
$$;

create or replace function public.rotate_invite(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.new_invite_code();
begin
  perform public.require_creator(p_trip);
  update public.trips set invite_code = v_code, invite_expires_at = now() + interval '7 days' where id = p_trip;
  return v_code;
end;
$$;

-- Removal now also bans the account and replaces the link it came in through.
create or replace function public.remove_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_user uuid;
begin
  select trip_id, user_id into v_trip, v_user from public.members where id = p_member;
  if v_trip is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.require_creator(v_trip);
  if v_user = (select auth.uid()) then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;

  if v_user is not null then
    insert into public.trip_bans (trip_id, user_id) values (v_trip, v_user) on conflict do nothing;
  end if;
  update public.trips set invite_code = public.new_invite_code(), invite_expires_at = now() + interval '7 days'
  where id = v_trip;

  if exists (select 1 from public.expenses e where e.trip_id = v_trip and (e.paid_by = p_member or e.split ? p_member::text))
     or exists (select 1 from public.payments p where p.from_member = p_member or p.to_member = p_member) then
    update public.members set user_id = null, pending_user_id = null, promptpay_id = null, payee_name = null
    where id = p_member;
  else
    delete from public.members where id = p_member;
  end if;
end;
$$;

-- Payments: one implementation, two doors. Clients record manual payments
-- only; a payment backed by a slip the server read can be recorded only by
-- the server (service role), so "has a slip" cannot be faked from a browser.
create function public.record_payment_as(p_user uuid, p_payment jsonb, p_slip jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid := (p_payment ->> 'trip_id')::uuid;
  v_from uuid := (p_payment ->> 'from_member')::uuid;
  v_to uuid := (p_payment ->> 'to_member')::uuid;
  v_from_user uuid;
  v_to_user uuid;
  v_status text;
  v_row public.payments;
begin
  if p_user is null or not exists (select 1 from public.members where trip_id = v_trip and user_id = p_user) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  select user_id into v_from_user from public.members where id = v_from and trip_id = v_trip;
  select user_id into v_to_user from public.members where id = v_to and trip_id = v_trip;

  if v_to_user = p_user then
    v_status := 'confirmed';
  elsif v_from_user = p_user or v_from_user is null then
    v_status := 'claimed';
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.payments (id, trip_id, from_member, to_member, amount, status, source, slip, created_by,
                               decided_by, decided_at)
  values (
    (p_payment ->> 'id')::uuid, v_trip, v_from, v_to, (p_payment ->> 'amount')::integer, v_status,
    case when p_slip is null then 'manual' else 'slip' end, p_slip, p_user,
    case when v_status = 'confirmed' then p_user end,
    case when v_status = 'confirmed' then now() end
  )
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.payments where id = (p_payment ->> 'id')::uuid and trip_id = v_trip;
    if v_row.id is null then
      raise exception 'id_in_use' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'exists', 'row', to_jsonb(v_row));
  end if;
  return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
end;
$$;

create or replace function public.record_payment(p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.record_payment_as(public.require_user(), p_payment, null);
end;
$$;

create function public.record_slip_payment(p_user uuid, p_payment jsonb, p_slip jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.record_payment_as(p_user, p_payment, p_slip);
end;
$$;

-- Nobody confirms money they say they sent, including the creator acting for
-- a receiver who has not joined.
create or replace function public.decide_payment(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_row public.payments;
  v_to_user uuid;
  v_from_user uuid;
  v_creator uuid;
begin
  select * into v_row from public.payments where id = p_id;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.require_member(v_row.trip_id);
  if v_row.status <> 'claimed' then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;

  select user_id into v_to_user from public.members where id = v_row.to_member;
  select user_id into v_from_user from public.members where id = v_row.from_member;
  select created_by into v_creator from public.trips where id = v_row.trip_id;

  if p_decision = 'cancelled' then
    if v_row.created_by is distinct from v_user then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif p_decision in ('confirmed', 'rejected') then
    if not (v_to_user = v_user or (v_to_user is null and v_creator = v_user)) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if v_row.created_by = v_user or v_from_user = v_user then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update public.payments set status = p_decision, decided_by = v_user, decided_at = now()
  where id = p_id
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
end;
$$;

-- Weights stay within sane bounds so no split can produce Infinity or NaN.
create or replace function public.validate_split(p_trip uuid, p_mode text, p_split jsonb, p_amount integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  n numeric;
  total numeric := 0;
  positive int := 0;
begin
  if jsonb_typeof(p_split) <> 'object' then
    raise exception 'invalid_split: not an object' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_split) loop
    if jsonb_typeof(v) <> 'number' then
      raise exception 'invalid_split: % is not a number', k using errcode = '22023';
    end if;
    if not exists (select 1 from public.members m where m.trip_id = p_trip and m.id::text = k) then
      raise exception 'invalid_split: % is not in this trip', k using errcode = '22023';
    end if;
    n := (v::text)::numeric;
    if n < 0 then
      raise exception 'invalid_split: negative share' using errcode = '22023';
    end if;
    if p_mode = 'equal' and n not in (0, 1) then
      raise exception 'invalid_split: equal shares must be 0 or 1' using errcode = '22023';
    end if;
    if p_mode = 'weights' and (n > 1000 or scale(n) > 3) then
      raise exception 'invalid_split: weights are 0 to 1000 with at most 3 decimals' using errcode = '22023';
    end if;
    if p_mode = 'exact' and n <> trunc(n) then
      raise exception 'invalid_split: exact shares are whole satang' using errcode = '22023';
    end if;
    total := total + n;
    if n > 0 then positive := positive + 1; end if;
  end loop;
  if positive = 0 then
    raise exception 'invalid_split: nobody shares this expense' using errcode = '22023';
  end if;
  if p_mode = 'exact' and total <> p_amount then
    raise exception 'invalid_split: exact shares add up to % not %', total, p_amount using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.record_payment_as(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_slip_payment(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_slip_payment(uuid, jsonb, jsonb) to service_role;
revoke execute on function public.decide_claim(uuid, boolean) from public, anon;
grant execute on function public.decide_claim(uuid, boolean) to authenticated;
