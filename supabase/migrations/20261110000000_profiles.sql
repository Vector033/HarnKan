-- One row per person: the defaults each new trip starts from. It follows the
-- user, so with Google it follows them to every device. Only its owner sees it.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (char_length(btrim(nickname)) between 1 and 30),
  promptpay_id text check (promptpay_id ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})$'),
  payee_name text check (char_length(payee_name) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

create policy "own profile only" on public.profiles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Creating, joining or claiming a name copies the payout account into the new
-- member row, unless that row already has one. Only the person's own profile is read.
create function public.fill_member_from_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.promptpay_id is null and new.payee_name is null then
    select p.promptpay_id, p.payee_name into new.promptpay_id, new.payee_name
    from public.profiles p where p.user_id = new.user_id;
  end if;
  return new;
end $$;

revoke execute on function public.fill_member_from_profile() from public, anon, authenticated;

create trigger members_fill_from_profile
  before insert or update of user_id on public.members
  for each row execute function public.fill_member_from_profile();
