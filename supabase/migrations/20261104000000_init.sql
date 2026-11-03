-- HarnKan schema.
--
-- Money is stored in satang (integer, 1 baht = 100). Everyone in a trip is a
-- Supabase user (anonymous sign-in is enough) linked to a row in `members`.
-- Reads go through RLS; every write that needs a check (version conflicts,
-- split validation, who may confirm a payment) goes through a function below,
-- and the tables have no write policies of their own except where noted.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- null for a placeholder: someone added by name who has not opened the link yet
  user_id uuid references auth.users (id) on delete set null,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 30),
  -- phone (10 digits), national/tax id (13) or e-wallet id (15)
  promptpay_id text check (promptpay_id ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})$'),
  -- the name the bank prints on slips, used to match slips to this member
  payee_name text check (char_length(payee_name) <= 80),
  created_at timestamptz not null default now(),
  unique (trip_id, user_id),
  unique (trip_id, id)
);
create unique index members_trip_nickname on public.members (trip_id, lower(btrim(nickname)));

create table public.expenses (
  -- generated on the client so a create replayed from the offline queue is idempotent
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  amount integer not null check (amount > 0 and amount <= 100000000),
  paid_by uuid not null,
  split_mode text not null check (split_mode in ('equal', 'weights', 'exact')),
  -- { "<member id>": number }; 1 per participant for equal, a weight, or satang
  split jsonb not null,
  spent_at timestamptz not null default now(),
  deleted boolean not null default false,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trip_id, paid_by) references public.members (trip_id, id)
);
create index expenses_trip on public.expenses (trip_id);

create table public.payments (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount integer not null check (amount > 0 and amount <= 100000000),
  status text not null check (status in ('claimed', 'confirmed', 'rejected', 'cancelled')),
  source text not null check (source in ('manual', 'slip')),
  -- fields read from the slip (amount, time, masked names). The image is never stored.
  slip jsonb,
  created_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_member <> to_member),
  foreign key (trip_id, from_member) references public.members (trip_id, id),
  foreign key (trip_id, to_member) references public.members (trip_id, id)
);
create index payments_trip on public.payments (trip_id);

-- One row per slip sent to the vision model; used only for rate limiting.
create table public.slip_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now()
);
create index slip_reads_user on public.slip_reads (user_id, read_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

create function public.is_trip_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.trip_id = t and m.user_id = (select auth.uid())
  );
$$;

alter table public.trips enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.slip_reads enable row level security;

create policy "members read their trips" on public.trips
  for select to authenticated using (public.is_trip_member(id));
create policy "members rename their trips" on public.trips
  for update to authenticated using (public.is_trip_member(id));
create policy "creator deletes the trip" on public.trips
  for delete to authenticated using (created_by = (select auth.uid()));

create policy "members read trip members" on public.members
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "members add placeholders" on public.members
  for insert to authenticated with check (public.is_trip_member(trip_id) and user_id is null);
-- A claimed row (and its PromptPay id) can only be edited by its own user, so
-- nobody can point someone else's QR at their own account.
create policy "edit own row or a placeholder" on public.members
  for update to authenticated
  using (public.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())))
  with check (public.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())));
create policy "remove unused placeholders" on public.members
  for delete to authenticated using (public.is_trip_member(trip_id) and user_id is null);

create policy "members read expenses" on public.expenses
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "members read payments" on public.payments
  for select to authenticated using (public.is_trip_member(trip_id));

-- Column-level grants: only these columns may change through plain UPDATEs.
revoke update on public.trips from anon, authenticated;
grant update (name) on public.trips to authenticated;
revoke update on public.members from anon, authenticated;
grant update (nickname, promptpay_id, payee_name) on public.members to authenticated;
revoke insert, update, delete on public.expenses, public.payments, public.slip_reads from anon, authenticated;
revoke all on public.trips, public.members, public.expenses, public.payments, public.slip_reads from anon;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid := (select auth.uid());
begin
  if v is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  return v;
end;
$$;

create function public.require_member(t uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_user();
  if not public.is_trip_member(t) then
    raise exception 'not_member' using errcode = '42501';
  end if;
end;
$$;

create function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- no 0/o, 1/l/i so a code read aloud is not ambiguous
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Creates a trip and makes the caller its first member.
create function public.create_trip(p_name text, p_nickname text)
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
  insert into public.trips (name, invite_code, created_by)
  values (btrim(p_name), v_code, v_user)
  returning id into v_trip;

  insert into public.members (trip_id, user_id, nickname)
  values (v_trip, v_user, btrim(p_nickname))
  returning id into v_member;

  return jsonb_build_object('trip_id', v_trip, 'member_id', v_member, 'invite_code', v_code);
end;
$$;

-- What someone holding an invite link may see before joining.
create function public.trip_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'already_member', exists (
      select 1 from public.members m where m.trip_id = t.id and m.user_id = (select auth.uid())
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nickname', m.nickname, 'claimed', m.user_id is not null)
                       order by m.created_at)
      from public.members m where m.trip_id = t.id
    ), '[]'::jsonb)
  )
  from public.trips t
  where t.invite_code = lower(btrim(p_code));
$$;

-- Joins a trip by invite code, either as a new member or by claiming a
-- placeholder that someone already added by name. Joining twice is a no-op.
create function public.join_trip(p_code text, p_nickname text default null, p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_trip uuid;
  v_member uuid;
begin
  select id into v_trip from public.trips where invite_code = lower(btrim(p_code));
  if v_trip is null then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  select id into v_member from public.members where trip_id = v_trip and user_id = v_user;
  if v_member is not null then
    return jsonb_build_object('trip_id', v_trip, 'member_id', v_member);
  end if;

  if p_member_id is not null then
    update public.members set user_id = v_user
    where id = p_member_id and trip_id = v_trip and user_id is null
    returning id into v_member;
    if v_member is null then
      raise exception 'member_already_claimed' using errcode = 'P0001';
    end if;
  else
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

-- Server-side twin of src/lib/core/split.ts validateSplit.
create function public.validate_split(p_trip uuid, p_mode text, p_split jsonb, p_amount integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
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
    if (v::text)::numeric < 0 then
      raise exception 'invalid_split: negative share' using errcode = '22023';
    end if;
    if p_mode = 'equal' and (v::text)::numeric not in (0, 1) then
      raise exception 'invalid_split: equal shares must be 0 or 1' using errcode = '22023';
    end if;
    if p_mode = 'exact' and (v::text)::numeric <> trunc((v::text)::numeric) then
      raise exception 'invalid_split: exact shares are whole satang' using errcode = '22023';
    end if;
    total := total + (v::text)::numeric;
    if (v::text)::numeric > 0 then positive := positive + 1; end if;
  end loop;
  if positive = 0 then
    raise exception 'invalid_split: nobody shares this expense' using errcode = '22023';
  end if;
  if p_mode = 'exact' and total <> p_amount then
    raise exception 'invalid_split: exact shares add up to % not %', total, p_amount using errcode = '22023';
  end if;
end;
$$;

-- Creates (p_base_version null) or updates an expense.
--
-- Updates use optimistic concurrency: they only apply when the stored version
-- still equals the version the client started editing from. Otherwise nothing
-- changes and the current row comes back with status 'conflict' so the client
-- can show both versions and let the user pick.
create function public.save_expense(p_expense jsonb, p_base_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_trip uuid := (p_expense ->> 'trip_id')::uuid;
  v_amount integer := (p_expense ->> 'amount')::integer;
  v_mode text := p_expense ->> 'split_mode';
  v_split jsonb := p_expense -> 'split';
  v_row public.expenses;
begin
  perform public.require_member(v_trip);
  perform public.validate_split(v_trip, v_mode, v_split, v_amount);

  if p_base_version is null then
    insert into public.expenses (id, trip_id, title, amount, paid_by, split_mode, split, spent_at, created_by, updated_by)
    values (
      v_id, v_trip, btrim(p_expense ->> 'title'), v_amount, (p_expense ->> 'paid_by')::uuid, v_mode, v_split,
      coalesce((p_expense ->> 'spent_at')::timestamptz, now()), v_user, v_user
    )
    on conflict (id) do nothing
    returning * into v_row;
    if v_row.id is null then
      -- Already created: an offline create that is being replayed.
      select * into v_row from public.expenses where id = v_id and trip_id = v_trip;
      if v_row.id is null then
        raise exception 'id_in_use' using errcode = '23505';
      end if;
      return jsonb_build_object('status', 'exists', 'row', to_jsonb(v_row));
    end if;
    return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
  end if;

  update public.expenses set
    title = btrim(p_expense ->> 'title'),
    amount = v_amount,
    paid_by = (p_expense ->> 'paid_by')::uuid,
    split_mode = v_mode,
    split = v_split,
    spent_at = coalesce((p_expense ->> 'spent_at')::timestamptz, spent_at),
    version = version + 1,
    updated_by = v_user,
    updated_at = now()
  where id = v_id and trip_id = v_trip and version = p_base_version and not deleted
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.expenses where id = v_id and trip_id = v_trip;
    if v_row.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return jsonb_build_object('status', 'conflict', 'row', to_jsonb(v_row));
  end if;
  return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
end;
$$;

-- Soft delete with the same version check as save_expense. Rows are kept so
-- realtime subscribers see the change (DELETE events bypass RLS filtering).
create function public.delete_expense(p_id uuid, p_base_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_row public.expenses;
begin
  select * into v_row from public.expenses where id = p_id;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.require_member(v_row.trip_id);
  if v_row.deleted then
    return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
  end if;

  update public.expenses set deleted = true, version = version + 1, updated_by = v_user, updated_at = now()
  where id = p_id and version = p_base_version
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.expenses where id = p_id;
    return jsonb_build_object('status', 'conflict', 'row', to_jsonb(v_row));
  end if;
  return jsonb_build_object('status', 'ok', 'row', to_jsonb(v_row));
end;
$$;

-- Records that money moved from one member to another.
--
-- * The receiver recording it: confirmed straight away.
-- * The sender recording it (or anyone, for a sender who has not joined yet):
--   'claimed', waiting for the receiver to confirm.
create function public.record_payment(p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_trip uuid := (p_payment ->> 'trip_id')::uuid;
  v_from uuid := (p_payment ->> 'from_member')::uuid;
  v_to uuid := (p_payment ->> 'to_member')::uuid;
  v_from_user uuid;
  v_to_user uuid;
  v_status text;
  v_row public.payments;
begin
  perform public.require_member(v_trip);
  select user_id into v_from_user from public.members where id = v_from and trip_id = v_trip;
  select user_id into v_to_user from public.members where id = v_to and trip_id = v_trip;

  if v_to_user = v_user then
    v_status := 'confirmed';
  elsif v_from_user = v_user or v_from_user is null then
    v_status := 'claimed';
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.payments (id, trip_id, from_member, to_member, amount, status, source, slip, created_by,
                               decided_by, decided_at)
  values (
    (p_payment ->> 'id')::uuid, v_trip, v_from, v_to, (p_payment ->> 'amount')::integer, v_status,
    coalesce(p_payment ->> 'source', 'manual'), p_payment -> 'slip', v_user,
    case when v_status = 'confirmed' then v_user end,
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

-- The receiver accepts or rejects a claimed payment; the sender may cancel
-- their own claim. When the receiver has not joined, the trip creator decides.
create function public.decide_payment(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_row public.payments;
  v_to_user uuid;
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
  select created_by into v_creator from public.trips where id = v_row.trip_id;

  if p_decision = 'cancelled' then
    if v_row.created_by is distinct from v_user then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif p_decision in ('confirmed', 'rejected') then
    if not (v_to_user = v_user or (v_to_user is null and v_creator = v_user)) then
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

-- Called by the slip route before each model call. Raises when the caller has
-- used up the hourly allowance, which keeps vision API spend bounded.
create function public.note_slip_read(p_limit integer default 20)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
begin
  if (select count(*) from public.slip_reads where user_id = v_user and read_at > now() - interval '1 hour') >= p_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.slip_reads (user_id) values (v_user);
  delete from public.slip_reads where read_at < now() - interval '1 day';
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_trip(text, text),
  public.trip_preview(text),
  public.join_trip(text, text, uuid),
  public.save_expense(jsonb, integer),
  public.delete_expense(uuid, integer),
  public.record_payment(jsonb),
  public.decide_payment(uuid, text),
  public.note_slip_read(integer),
  public.is_trip_member(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.trips, public.members, public.expenses, public.payments;
