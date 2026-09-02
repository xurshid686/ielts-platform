-- ============================================================
-- IELTS Platform — 0042: Telegram admin bot
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** ADDITIVE AND BACKWARD COMPATIBLE. Safe before or after a deploy. ***
--
-- Nothing here changes the signature, return type, behaviour or grants of
-- anything the web app already calls. Old code keeps working unchanged.
--
-- ------------------------------------------------------------
-- WHY THIS EXISTS
-- ------------------------------------------------------------
-- The owner-only Telegram bot (/api/telegram) has no browser session. It uses
-- the service-role client, and under the service role `auth.uid()` is NULL.
--
-- Every admin RPC opens with the same gate:
--
--     v_caller uuid := auth.uid();
--     if not public.is_admin(v_caller) then raise exception '...';
--
-- so calling set_premium / gift_xp / set_user_level / set_leaderboard_hidden
-- from the bot raises 'Only admins can ...' every time. This is EXACTLY the
-- trap 0040 fixed for record_activity -> record_activity_for, and it is fixed
-- the same way here.
--
-- The pattern, applied consistently:
--
--   *_as(p_actor uuid, ...)   holds the logic, takes the acting admin's id
--                             explicitly, and is service-role only.
--   original(...)             becomes a one-line delegate passing auth.uid(),
--                             keeping its signature and its `authenticated`
--                             grant, so the web UI cannot tell the difference.
--
-- The admin check is NOT dropped — it moves. `is_admin(p_actor)` still runs,
-- so a caller holding the service-role key must still name a real admin. The
-- bot resolves that id from `profiles where is_owner`.
--
-- The alternative — having the bot UPDATE `profiles` directly — was rejected.
-- It would work (0023's guard only fires for `authenticated`/`anon`), but it
-- would fork the premium-extension and XP-clamping rules into a second copy
-- that drifts from this one.
--
-- The delegates are `security definer` and run as the table owner, so they can
-- execute the *_as functions despite the revoke below. Same mechanism 0036
-- documents for apply_rating calling grant_achievement.
--
-- ------------------------------------------------------------
-- TO ROLL BACK
-- ------------------------------------------------------------
--   drop table if exists public.telegram_sessions;
--   drop table if exists public.telegram_updates;
--   -- then re-run 0008, 0012, 0020 and 0021 to restore the original bodies,
--   -- and:
--   drop function if exists public.set_premium_as(uuid, text, int);
--   drop function if exists public.gift_xp_as(uuid, text, int);
--   drop function if exists public.set_user_level_as(uuid, text, text);
--   drop function if exists public.set_leaderboard_hidden_as(uuid, text, boolean);
-- ============================================================

set check_function_bodies = off;


-- ============================================================
-- 1. Bot state
-- ============================================================

-- The upload wizard spans messages of DIFFERENT KINDS: button taps carry
-- callback_data, but the title arrives as free text and the paper arrives as a
-- `document` — neither of which can carry state. Telegram's callback_data is
-- also capped at 64 bytes, which holds a verb and a uuid and nothing more.
-- So the wizard's progress lives here. In practice this table holds one row.
create table if not exists public.telegram_sessions (
  chat_id     bigint primary key,
  step        text        not null,
  data        jsonb       not null default '{}'::jsonb,
  -- The wizard message that gets edited in place as the flow advances, so the
  -- chat does not fill with a new card per tap.
  message_id  bigint,
  updated_at  timestamptz not null default now()
);

-- Telegram redelivers an update until it gets a 200, and a redelivered upload
-- would publish the same test twice. A retry carries the IDENTICAL update_id,
-- so this is an exact guard rather than a heuristic.
create table if not exists public.telegram_updates (
  update_id   bigint primary key,
  received_at timestamptz not null default now()
);

-- Old rows are pruned opportunistically by the bot rather than by a schedule.
-- Deliberate: Vercel cron does not run on the live DigitalOcean host, so a
-- cron-based cleaner would silently never fire (see CLAUDE.md).
create index if not exists telegram_updates_received_at_idx
  on public.telegram_updates (received_at);

-- Neither table is ever touched by a browser. RLS on with no policy at all,
-- plus the grants revoked, leaves them reachable only by the service role.
alter table public.telegram_sessions enable row level security;
alter table public.telegram_updates  enable row level security;

revoke all on public.telegram_sessions from anon, authenticated;
revoke all on public.telegram_updates  from anon, authenticated;


-- ============================================================
-- 2. set_premium  (body from 0008)
-- ============================================================

create or replace function public.set_premium_as(
  p_actor      uuid,
  target_email text,
  months       int
)
returns table (id uuid, email text, name text, premium_until timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_id    uuid;
  v_until timestamptz;
begin
  if not public.is_admin(p_actor) then
    raise exception 'Only admins can change membership';
  end if;

  select p.id into v_id
  from public.profiles p
  where lower(p.email) = lower(btrim(target_email));

  if v_id is null then
    raise exception 'No account found with that email';
  end if;

  if months is null or months <= 0 then
    v_until := null; -- revoke
  else
    -- Extend from the later of now or an existing future expiry.
    select greatest(now(), coalesce(p.premium_until, now())) + make_interval(months => months)
      into v_until
    from public.profiles p where p.id = v_id;
  end if;

  update public.profiles set premium_until = v_until where id = v_id;

  return query
    select p.id, p.email, p.name, p.premium_until
    from public.profiles p where p.id = v_id;
end;
$fn$;

create or replace function public.set_premium(target_email text, months int)
returns table (id uuid, email text, name text, premium_until timestamptz)
language sql
security definer
set search_path = public
as $fn$
  select * from public.set_premium_as(auth.uid(), target_email, months);
$fn$;

revoke all on function public.set_premium_as(uuid, text, int) from public, anon, authenticated;
grant execute on function public.set_premium_as(uuid, text, int) to service_role;
grant execute on function public.set_premium(text, int) to authenticated;


-- ============================================================
-- 3. gift_xp  (body from 0012)
-- ============================================================

create or replace function public.gift_xp_as(
  p_actor      uuid,
  target_email text,
  amount       int
)
returns table (id uuid, email text, name text, xp int)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if not public.is_admin(p_actor) then
    raise exception 'Only admins can gift XP';
  end if;
  if amount is null or amount = 0 then
    raise exception 'Enter an XP amount';
  end if;

  select p.id into v_id from public.profiles p
  where lower(p.email) = lower(btrim(target_email));
  if v_id is null then
    raise exception 'No account found with that email';
  end if;

  update public.profiles as p
     set xp = greatest(0, p.xp + amount)
   where p.id = v_id;

  return query
    select p.id, p.email, p.name, p.xp
    from public.profiles p where p.id = v_id;
end;
$fn$;

create or replace function public.gift_xp(target_email text, amount int)
returns table (id uuid, email text, name text, xp int)
language sql
security definer
set search_path = public
as $fn$
  select * from public.gift_xp_as(auth.uid(), target_email, amount);
$fn$;

revoke all on function public.gift_xp_as(uuid, text, int) from public, anon, authenticated;
grant execute on function public.gift_xp_as(uuid, text, int) to service_role;
grant execute on function public.gift_xp(text, int) to authenticated;


-- ============================================================
-- 4. set_leaderboard_hidden  (body from 0020)
-- ============================================================

create or replace function public.set_leaderboard_hidden_as(
  p_actor      uuid,
  target_email text,
  hidden       boolean
)
returns table (id uuid, email text, name text, hidden_from_leaderboard boolean)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if not public.is_admin(p_actor) then
    raise exception 'Only admins can change leaderboard visibility';
  end if;

  select p.id into v_id from public.profiles p
  where lower(p.email) = lower(btrim(target_email));
  if v_id is null then raise exception 'No account found with that email'; end if;

  update public.profiles
     set hidden_from_leaderboard = coalesce(hidden, false)
   where id = v_id;

  return query
    select p.id, p.email, p.name, p.hidden_from_leaderboard
    from public.profiles p where p.id = v_id;
end;
$fn$;

create or replace function public.set_leaderboard_hidden(target_email text, hidden boolean)
returns table (id uuid, email text, name text, hidden_from_leaderboard boolean)
language sql
security definer
set search_path = public
as $fn$
  select * from public.set_leaderboard_hidden_as(auth.uid(), target_email, hidden);
$fn$;

revoke all on function public.set_leaderboard_hidden_as(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_leaderboard_hidden_as(uuid, text, boolean) to service_role;
grant execute on function public.set_leaderboard_hidden(text, boolean) to authenticated;


-- ============================================================
-- 5. set_user_level  (body from 0021)
-- ============================================================
-- Note this one's original checked `profiles.role = 'admin'` directly rather
-- than calling is_admin(). Kept as-is against p_actor so behaviour is
-- identical, including its error codes.

create or replace function public.set_user_level_as(
  p_actor      uuid,
  target_email text,
  new_level    text
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role   text;
  updated_email text;
begin
  if new_level not in ('regular', 'pre_ielts', 'intro') then
    raise exception 'Invalid level: %', new_level using errcode = '22023';
  end if;

  select role into caller_role from profiles where id = p_actor;
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may set a student level.' using errcode = '42501';
  end if;

  update profiles
     set level = new_level
   where lower(email) = lower(trim(target_email))
   returning email into updated_email;

  if updated_email is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  return new_level;
end;
$fn$;

create or replace function public.set_user_level(target_email text, new_level text)
returns text
language sql
security definer
set search_path = public
as $fn$
  select public.set_user_level_as(auth.uid(), target_email, new_level);
$fn$;

revoke all on function public.set_user_level_as(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_user_level_as(uuid, text, text) to service_role;
grant execute on function public.set_user_level(text, text) to authenticated;


-- ============================================================
-- VERIFY
-- ============================================================
-- 1. The delegates still exist with their original signatures and grants:
--      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--             has_function_privilege('authenticated', p.oid, 'execute') as auth_can
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('set_premium','gift_xp','set_user_level','set_leaderboard_hidden');
--    -> all four, auth_can = true
--
-- 2. The *_as variants are service-role only:
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as auth_can,
--             has_function_privilege('service_role', p.oid, 'execute')  as svc_can
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname like '%\_as';
--    -> auth_can = false, svc_can = true
--
-- 3. The admin path still works, rolled back so nothing is actually changed:
--      begin;
--        select * from public.set_premium_as(
--          (select id from public.profiles where is_owner limit 1),
--          (select email from public.profiles where role = 'student' limit 1),
--          1);
--      rollback;
--
-- 4. A non-admin actor is still refused:
--      select * from public.set_premium_as(
--        (select id from public.profiles where role = 'student' limit 1),
--        'anyone@example.com', 1);
--    -> ERROR: Only admins can change membership
-- ============================================================
