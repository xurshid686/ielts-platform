-- 0069 — weekly free Premium passes + a one-time 3-day trial (owner, 2026-11-23).
--
-- Why: on 2026-11-15..18 about 400 tests moved to Premium, leaving 21 free
-- reading papers. The share of new accounts that took any test fell from
-- 55-65% to 32% that week. Passes give every account a real taste of the
-- library each week; the trial gives a new student the whole library for
-- three days right after their first result.
--
-- ADDITIVE. Nothing reads these tables until the matching code ships, so this
-- can be applied before the deploy.
--
-- Deliberately NOT done with profiles.premium_until: that column drives the
-- Premium-expiring emails, the renewal banner, instant mock entry and the
-- paid AI writing checks. The owner chose "tests only" for the trial, so the
-- trial lives in its own table and only the test-access rule reads it.

create table if not exists public.premium_passes (
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  -- Monday of the claim's week, Asia/Tashkent. The weekly allowance counts on this.
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, test_id)
);
create index if not exists premium_passes_user_week_idx
  on public.premium_passes (user_id, week_start);

create table if not exists public.premium_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);

alter table public.premium_passes enable row level security;
alter table public.premium_trials enable row level security;
-- New public tables inherit Supabase's default grants; take them away.
revoke all on public.premium_passes from anon, authenticated;
revoke all on public.premium_trials from anon, authenticated;

-- Claim one pass. Service role only: the server action passes the user id from
-- the verified session. One transaction, serialised per user by an advisory
-- lock, so two tabs cannot both spend the last pass.
-- Returns: 'ok' | 'already' | 'limit' | 'not_premium'
create or replace function public.claim_premium_pass(p_user uuid, p_test uuid, p_limit int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := date_trunc('week', (now() at time zone 'Asia/Tashkent'))::date;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext('premium_pass:' || p_user::text));

  if exists (select 1 from premium_passes where user_id = p_user and test_id = p_test) then
    return 'already';
  end if;

  if not exists (
    select 1 from tests
     where id = p_test and tier = 'premium' and coalesce(track, 'regular') = 'regular'
  ) then
    return 'not_premium';
  end if;

  select count(*) into v_used from premium_passes
   where user_id = p_user and week_start = v_week;
  if v_used >= p_limit then
    return 'limit';
  end if;

  insert into premium_passes (user_id, test_id, week_start) values (p_user, p_test, v_week);
  return 'ok';
end;
$$;

revoke all on function public.claim_premium_pass(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_premium_pass(uuid, uuid, int) to service_role;

-- Verify (as anon / authenticated these must all be refused):
--   select * from premium_passes;            -> permission denied
--   select * from premium_trials;            -> permission denied
--   select claim_premium_pass(...);          -> permission denied
