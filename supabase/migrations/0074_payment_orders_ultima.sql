-- 0074 — Ultima can be bought online too (owner, 2026-11-24).
--
-- payment_orders gains `plan` ('premium' | 'ultima', default 'premium', so every
-- 0073 row keeps meaning what it meant). Paying an Ultima order extends BOTH
-- ultima_members.ultima_until and profiles.premium_until by the same months:
-- the same rule as the owner's manual grant (setUltima in actions/admin.ts,
-- "which also extends Premium by the same period"). A refund takes both back.
--
-- ADDITIVE for the running code: the 0073 code inserts no `plan`, gets the
-- default, and the replaced functions behave exactly as before for premium.

alter table public.payment_orders
  add column if not exists plan text not null default 'premium'
  check (plan in ('premium', 'ultima'));

alter table public.payment_orders
  add column if not exists ultima_until_after timestamptz;

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

revoke all on function public.fulfil_payment_order(uuid, bigint) from public, anon, authenticated;
revoke all on function public.refund_payment_order(uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.fulfil_payment_order(uuid, bigint) to service_role;
grant execute on function public.refund_payment_order(uuid, int, bigint) to service_role;
