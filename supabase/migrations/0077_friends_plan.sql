-- 0077 — Friends plan (owner, 2026-11-27): one organiser buys Premium for a
-- group of up to 4 people (the organiser included), 1 or 3 months. Friends join
-- with an invite link (/join/<code>) and get Premium until the group's end date.
--
-- ADDITIVE: two new tables, new service-role functions, 'friends' added to the
-- payment_orders.plan check, and fulfil/refund re-created with one extra branch
-- each. The running code never writes plan = 'friends', so it behaves exactly
-- as before. Verify with scripts/check-0077.mjs.
--
-- Rules:
--   * a person is in at most one group (premium_group_members.user_id unique);
--   * a member's premium_until is RAISED to the group's expires_at, never
--     lowered: anyone who already has a later date keeps it;
--   * buying again (or an admin grant) extends the group from max(now, end);
--   * removing a member frees the seat; Premium already given is left alone.

-- ------------------------------------------------------------------ tables
create table if not exists public.premium_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references public.profiles(id) on delete cascade,
  seats       int  not null default 4 check (seats between 2 and 10),
  expires_at  timestamptz not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

create table if not exists public.premium_group_members (
  group_id  uuid not null references public.premium_groups(id) on delete cascade,
  user_id   uuid not null unique references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.premium_groups enable row level security;
alter table public.premium_group_members enable row level security;
revoke all on public.premium_groups from anon, authenticated;
revoke all on public.premium_group_members from anon, authenticated;

-- ------------------------------------------------------------------ orders
alter table public.payment_orders drop constraint if exists payment_orders_plan_check;
alter table public.payment_orders
  add constraint payment_orders_plan_check check (plan in ('premium', 'ultima', 'friends'));

-- ------------------------------------------------------------------ helpers
-- 10 characters without look-alikes (no 0/O, 1/I/L), from gen_random_uuid's
-- strong randomness: 31^10 ≈ 8·10^14 codes.
create or replace function public.friends_new_code()
returns text
language plpgsql
set search_path = public
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  hex text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  code text := '';
  i int;
begin
  for i in 0..9 loop
    code := code || substr(alphabet, 1 + (('x' || substr(hex, 1 + i * 4, 4))::bit(16)::int % 31), 1);
  end loop;
  return code;
end;
$fn$;

-- Create the organiser's group if missing, push its end date out by p_months,
-- then raise every member's premium_until to that end date.
create or replace function public.friends_extend(p_owner uuid, p_months int, p_by uuid default null)
returns public.premium_groups
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
begin
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'bad months' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  -- The organiser can't run a group while being a guest in someone else's.
  if exists (select 1 from public.premium_group_members m
              join public.premium_groups pg on pg.id = m.group_id
             where m.user_id = p_owner and pg.owner_id <> p_owner) then
    raise exception 'already a member of another group' using errcode = 'P0001';
  end if;

  select * into g from public.premium_groups where owner_id = p_owner for update;
  if not found then
    loop
      begin
        insert into public.premium_groups (owner_id, expires_at, invite_code, created_by)
        values (p_owner, now() + make_interval(months => p_months), public.friends_new_code(), p_by)
        returning * into g;
        exit;
      exception when unique_violation then
        -- a code collision (astronomically rare): try another code
        if exists (select 1 from public.premium_groups where owner_id = p_owner) then raise; end if;
      end;
    end loop;
    insert into public.premium_group_members (group_id, user_id) values (g.id, p_owner)
    on conflict do nothing;
  else
    update public.premium_groups
       set expires_at = greatest(now(), expires_at) + make_interval(months => p_months)
     where id = g.id
     returning * into g;
  end if;

  update public.profiles p
     set premium_until = g.expires_at,
         premium_announce = true
    from public.premium_group_members m
   where m.group_id = g.id and p.id = m.user_id
     and (p.premium_until is null or p.premium_until < g.expires_at);

  return g;
end;
$fn$;

-- Join a group by invite code. Returns 'joined' | 'already' | 'full' |
-- 'expired' | 'not_found' | 'other_group'. The group row is locked, so two
-- people racing for the last seat cannot both get it.
create or replace function public.friends_join(p_user uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
  mine uuid;
  used int;
begin
  select * into g from public.premium_groups
   where invite_code = upper(trim(p_code)) for update;
  if not found then return 'not_found'; end if;

  select group_id into mine from public.premium_group_members where user_id = p_user;
  if mine = g.id then return 'already'; end if;
  if mine is not null then return 'other_group'; end if;
  if g.expires_at <= now() then return 'expired'; end if;

  select count(*) into used from public.premium_group_members where group_id = g.id;
  if used >= g.seats then return 'full'; end if;

  insert into public.premium_group_members (group_id, user_id) values (g.id, p_user);
  update public.profiles
     set premium_until = g.expires_at, premium_announce = true
   where id = p_user and (premium_until is null or premium_until < g.expires_at);
  return 'joined';
end;
$fn$;

-- Admin wrappers (actor checked, called with the service role by the app).
create or replace function public.admin_friends_extend_as(p_actor uuid, p_owner uuid, p_months int)
returns public.premium_groups
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin(p_actor) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return public.friends_extend(p_owner, p_months, p_actor);
end;
$fn$;

create or replace function public.admin_friends_remove_as(p_actor uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin(p_actor) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  -- The organiser can't be removed from their own group.
  delete from public.premium_group_members m
   using public.premium_groups g
   where m.group_id = g.id and m.user_id = p_user and g.owner_id <> p_user;
end;
$fn$;

-- ------------------------------------------------------------------ payments
-- 0075's body + one branch: a paid 'friends' order also extends the buyer's group.
create or replace function public.fulfil_payment_order(p_order uuid, p_perform_time bigint default null)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.payment_orders;
  v_until timestamptz;
  v_ultima timestamptz;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.status = 'paid' then
    return o;                                   -- idempotent
  end if;
  if o.status = 'cancelled' then
    raise exception 'order cancelled' using errcode = 'P0001';
  end if;
  -- 0075: only an order a provider transaction has claimed (attachTx) is payable.
  if o.status <> 'pending' then
    raise exception 'order not pending' using errcode = 'P0001';
  end if;

  if o.user_id is not null then
    update public.profiles p
       set premium_until = greatest(now(), coalesce(p.premium_until, now())) + make_interval(months => o.months),
           premium_announce = true
     where p.id = o.user_id
     returning p.premium_until into v_until;

    if o.plan = 'ultima' then
      insert into public.ultima_members as u (user_id, ultima_until, granted_by, granted_at)
      values (o.user_id, now() + make_interval(months => o.months), null, now())
      on conflict (user_id) do update
        set ultima_until = greatest(now(), u.ultima_until) + make_interval(months => o.months),
            granted_at = now()
      returning u.ultima_until into v_ultima;
    end if;

    if o.plan = 'friends' then
      perform public.friends_extend(o.user_id, o.months, null);
      select premium_until into v_until from public.profiles where id = o.user_id;
    end if;
  end if;

  update public.payment_orders
     set status = 'paid',
         paid_at = now(),
         perform_time = coalesce(p_perform_time, perform_time),
         payme_state = case when provider = 'payme' then 2 else payme_state end,
         premium_until_after = v_until,
         ultima_until_after = v_ultima
   where id = p_order
   returning * into o;
  return o;
end;
$fn$;

-- 0074's body + one branch: refunding a 'friends' order shortens the group.
create or replace function public.refund_payment_order(p_order uuid, p_reason int, p_cancel_time bigint)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.payment_orders;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.status = 'cancelled' then
    return o;                                   -- idempotent
  end if;
  if o.status = 'paid' and o.user_id is not null then
    update public.profiles p
       set premium_until = greatest(now(), p.premium_until - make_interval(months => o.months))
     where p.id = o.user_id and p.premium_until is not null;
    if o.plan = 'ultima' then
      update public.ultima_members u
         set ultima_until = greatest(now(), u.ultima_until - make_interval(months => o.months))
       where u.user_id = o.user_id;
    end if;
    if o.plan = 'friends' then
      update public.premium_groups g
         set expires_at = greatest(now(), g.expires_at - make_interval(months => o.months))
       where g.owner_id = o.user_id;
    end if;
  end if;

  update public.payment_orders
     set status = 'cancelled',
         refunded_at = case when o.status = 'paid' then now() else null end,
         payme_state = case when provider = 'payme' then (case when o.status = 'paid' then -2 else -1 end) else payme_state end,
         cancel_reason = p_reason,
         cancel_time = p_cancel_time
   where id = p_order
   returning * into o;
  return o;
end;
$fn$;

-- ------------------------------------------------------------------ grants
revoke all on function public.friends_new_code() from public, anon, authenticated;
revoke all on function public.friends_extend(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.friends_join(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_friends_extend_as(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.admin_friends_remove_as(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fulfil_payment_order(uuid, bigint) from public, anon, authenticated;
revoke all on function public.refund_payment_order(uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.friends_new_code() to service_role;
grant execute on function public.friends_extend(uuid, int, uuid) to service_role;
grant execute on function public.friends_join(uuid, text) to service_role;
grant execute on function public.admin_friends_extend_as(uuid, uuid, int) to service_role;
grant execute on function public.admin_friends_remove_as(uuid, uuid) to service_role;
grant execute on function public.fulfil_payment_order(uuid, bigint) to service_role;
grant execute on function public.refund_payment_order(uuid, int, bigint) to service_role;
