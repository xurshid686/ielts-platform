-- 0073 — online payment for Premium: Payme + Click (owner, 2026-11-24).
--
-- A student starts a checkout on /premium; the provider calls OUR webhook
-- (/api/payments/payme, /api/payments/click/*) and only then is the order paid
-- and Premium extended. The amount is always the server's, never the browser's.
--
-- ADDITIVE. Nothing reads these objects until the code ships, and the Pay
-- buttons stay hidden until the provider keys are set.
-- Stance of 0050 / 0069 / 0072: RLS on, NO policies, NO grants for anon or
-- authenticated. src/lib/payments/orders.ts (service role) is the only door.

create table if not exists public.payment_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete set null,
  email_snapshot      text,
  months              int not null check (months in (1, 3)),
  amount_tiyin        bigint not null check (amount_tiyin > 0),   -- so'm x 100
  provider            text not null check (provider in ('payme', 'click')),
  status              text not null default 'created'
                      check (status in ('created', 'pending', 'paid', 'cancelled')),
  provider_tx_id      text,
  -- Payme's own bookkeeping (ms since epoch, its "state" and cancel reason).
  payme_state         int,
  create_time         bigint,
  perform_time        bigint,
  cancel_time         bigint,
  cancel_reason       int,
  -- Click: the merchant_prepare_id we hand back at Prepare.
  click_prepare_id    bigint generated always as identity,
  paid_at             timestamptz,
  premium_until_after timestamptz,
  refunded_at         timestamptz,
  created_at          timestamptz not null default now()
);

create unique index if not exists payment_orders_provider_tx_uidx
  on public.payment_orders (provider, provider_tx_id) where provider_tx_id is not null;
create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);
create index if not exists payment_orders_status_idx on public.payment_orders (status, created_at desc);
create index if not exists payment_orders_payme_time_idx on public.payment_orders (create_time)
  where provider = 'payme';

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;

-- Pay an order and extend Premium, ONCE. Providers retry, so a second call on
-- a paid order returns it unchanged. Extends from the later of now and the
-- current expiry, exactly like set_premium_as (0042). Sets premium_announce so
-- the existing welcome shows. premium_until is a privileged field, but the
-- 0068 guard only fires for anon/authenticated; this runs as service_role.
create or replace function public.fulfil_payment_order(p_order uuid, p_perform_time bigint default null)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.payment_orders;
  v_until timestamptz;
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
  end if;

  update public.payment_orders
     set status = 'paid',
         paid_at = now(),
         perform_time = coalesce(p_perform_time, perform_time),
         payme_state = case when provider = 'payme' then 2 else payme_state end,
         premium_until_after = v_until
   where id = p_order
   returning * into o;
  return o;
end;
$fn$;

-- A refund of a PAID order (Payme CancelTransaction after perform). Takes the
-- months back off premium_until, never to before now. Idempotent.
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
