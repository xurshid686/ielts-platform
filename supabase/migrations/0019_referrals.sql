-- ============================================================
-- IELTS Platform — 0019: referral program
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS DOES
-- Every student gets a unique, shareable referral_code. When a friend signs up
-- through their link and then COMPLETES THEIR FIRST TEST (the anti-abuse bar),
-- the referrer is automatically granted +1 month of Premium. The new friend
-- also gets a small welcome XP bonus for joining via an invite.
--
-- Attribution works for BOTH email/password and Google OAuth signups: the app
-- stores the code in a cookie and calls redeem_referral() once, right after the
-- account is created. Rewards and grants run inside SECURITY DEFINER functions,
-- so RLS still blocks any client-side tampering.

set check_function_bodies = off;

-- ------------------------------------------------------------
-- 1. Columns on profiles
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by   uuid references public.profiles(id) on delete set null;

create index if not exists profiles_referred_by_idx on public.profiles(referred_by);

-- Reward configuration (months of Premium per qualified referral).
-- Kept as a constant in one place so the value is easy to find/change.
create or replace function public.referral_reward_months()
returns int language sql immutable as $$ select 1 $$;

-- The XP welcome bonus a newly-referred friend receives on signup.
create or replace function public.referral_welcome_xp()
returns int language sql immutable as $$ select 50 $$;

-- ------------------------------------------------------------
-- 2. Code generation — short, unambiguous (no 0/O/1/I/L)
-- ------------------------------------------------------------
create or replace function public.gen_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  attempts int := 0;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    -- Unique? then return it. Otherwise retry (vanishingly rare).
    exit when not exists (select 1 from public.profiles where referral_code = code);
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'Could not generate a unique referral code';
    end if;
  end loop;
  return code;
end;
$$;

-- Backfill any existing profiles that don't have a code yet.
do $$
declare r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = public.gen_referral_code() where id = r.id;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. referrals — one row per (referrer, referred) pair
-- ------------------------------------------------------------
create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  referred_id  uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','qualified')),
  reward_months int not null default 0,        -- months of Premium granted on qualify
  created_at   timestamptz not null default now(),
  qualified_at timestamptz,                     -- when the friend completed their first test
  unique (referred_id)                          -- a user can only ever be referred once
);
alter table public.referrals enable row level security;
create index if not exists referrals_referrer_idx on public.referrals(referrer_id, created_at desc);

-- The referrer can see who they've invited; the referred can see their own row.
drop policy if exists "referrals_select_party" on public.referrals;
create policy "referrals_select_party" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
-- No client write policies: rows are written only by the functions below.

-- ------------------------------------------------------------
-- 4. Auto-generate a code for every NEW profile
--    (extends handle_new_user from 0001 — keep its existing behaviour).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url, referral_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    public.gen_referral_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. redeem_referral — attribute a signup to a referrer's code
--    Called once by the app right after the account is created.
--    Idempotent: a no-op if already referred, self-referral, bad code,
--    or the account is older than the attribution window.
-- ------------------------------------------------------------
create or replace function public.redeem_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_me       public.profiles%rowtype;
  v_referrer uuid;
begin
  if v_caller is null or p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  select * into v_me from public.profiles where id = v_caller for update;
  if not found or v_me.referred_by is not null then
    return false;                       -- already attributed (or no profile yet)
  end if;

  -- Only attributable within 14 days of joining — stops old accounts claiming codes.
  if v_me.created_at < now() - interval '14 days' then
    return false;
  end if;

  select id into v_referrer
  from public.profiles
  where referral_code = upper(btrim(p_code));

  if v_referrer is null or v_referrer = v_caller then
    return false;                       -- unknown code, or own code
  end if;

  update public.profiles
     set referred_by = v_referrer,
         xp = xp + public.referral_welcome_xp()
   where id = v_caller;

  insert into public.referrals (referrer_id, referred_id, status, reward_months)
  values (v_referrer, v_caller, 'pending', public.referral_reward_months())
  on conflict (referred_id) do nothing;

  return true;
end;
$$;

grant execute on function public.redeem_referral(text) to authenticated;

-- ------------------------------------------------------------
-- 6. Qualify on the referred friend's FIRST test, granting the referrer Premium
-- ------------------------------------------------------------
create or replace function public.qualify_referral_on_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     public.referrals%rowtype;
  v_months  int;
  v_until   timestamptz;
  v_name    text;
begin
  -- Find a still-pending referral where NEW.user_id is the referred friend.
  select * into v_ref
  from public.referrals
  where referred_id = new.user_id and status = 'pending'
  for update;

  if not found then
    return new;                          -- not referred, or already qualified
  end if;

  v_months := greatest(1, coalesce(v_ref.reward_months, 1));

  -- Extend the referrer's Premium from the later of now / their current expiry.
  select greatest(now(), coalesce(premium_until, now())) + make_interval(months => v_months)
    into v_until
  from public.profiles where id = v_ref.referrer_id;

  update public.profiles
     set premium_until = v_until,
         premium_announce = true
   where id = v_ref.referrer_id;

  update public.referrals
     set status = 'qualified', qualified_at = now()
   where id = v_ref.id;

  -- Tell the referrer they earned a free month.
  select coalesce(name, 'Your friend') into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_ref.referrer_id,
    'referral',
    'You earned ' || v_months || ' month' || (case when v_months = 1 then '' else 's' end) || ' of Premium! 🎉',
    v_name || ' completed their first test through your invite.',
    jsonb_build_object('referred_id', new.user_id, 'months', v_months)
  );

  return new;
end;
$$;

-- Runs alongside the existing on_result_done (0011) and apply_rating call.
drop trigger if exists on_result_referral on public.results;
create trigger on_result_referral
  after insert on public.results
  for each row execute function public.qualify_referral_on_result();

-- ------------------------------------------------------------
-- 7. Lock down the new columns against client tampering
--    (extends protect_profile_privileged_fields from 0014).
-- ------------------------------------------------------------
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role               is distinct from old.role
       or new.is_owner          is distinct from old.is_owner
       or new.xp                is distinct from old.xp
       or new.premium_until     is distinct from old.premium_until
       or new.streak            is distinct from old.streak
       or new.longest_streak    is distinct from old.longest_streak
       or new.last_activity_date is distinct from old.last_activity_date
       or new.referral_code     is distinct from old.referral_code
       or new.referred_by       is distinct from old.referred_by
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- DONE.
-- ============================================================
