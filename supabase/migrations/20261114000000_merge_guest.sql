-- Moves an anonymous guest's trips into the account they then signed in with
-- (a Google account that already belonged to another user). Called only by
-- the server route, with the service role, after it has checked both sessions.
create function public.merge_guest(p_guest uuid, p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_moved integer;
begin
  if p_guest is null or p_user is null or p_guest = p_user then
    return 0;
  end if;
  if not exists (select 1 from auth.users where id = p_guest and is_anonymous) then
    raise exception 'not_guest';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'no_user';
  end if;

  -- In a trip the account is already in, the guest's member stays as an unclaimed
  -- name so the money recorded under it does not change; payout details go with it.
  update public.members g
  set user_id = null, pending_user_id = null, promptpay_id = null, payee_name = null
  where g.user_id = p_guest
    and exists (select 1 from public.members m where m.trip_id = g.trip_id and m.user_id = p_user);

  update public.members set user_id = p_user where user_id = p_guest;
  get diagnostics v_moved = row_count;

  update public.members g set pending_user_id = p_user
  where g.pending_user_id = p_guest
    and not exists (select 1 from public.members m where m.trip_id = g.trip_id and m.user_id = p_user);
  update public.members set pending_user_id = null where pending_user_id = p_guest;

  update public.trips set created_by = p_user where created_by = p_guest;
  update public.expenses set created_by = p_user where created_by = p_guest;
  update public.expenses set updated_by = p_user where updated_by = p_guest;
  update public.payments set created_by = p_user where created_by = p_guest;
  update public.payments set decided_by = p_user where decided_by = p_guest;
  -- A ban follows the person, so signing in elsewhere is not a way back in.
  insert into public.trip_bans (trip_id, user_id)
  select trip_id, p_user from public.trip_bans where user_id = p_guest
  on conflict do nothing;

  return v_moved;
end;
$$;

revoke execute on function public.merge_guest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_guest(uuid, uuid) to service_role;
