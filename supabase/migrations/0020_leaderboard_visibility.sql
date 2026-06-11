-- ============================================================
-- IELTS Platform — 0020: hide a user from the leaderboard (reversible)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Admins can temporarily remove someone from the public rating without
-- deleting any data. Flip `hidden_from_leaderboard` and the person drops out of
-- all three leaderboards (and loses their global rank everywhere it's shown);
-- flip it back and they reappear exactly where their rating places them.

set check_function_bodies = off;

-- ------------------------------------------------------------
-- 1. Flag column (default false = visible)
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists hidden_from_leaderboard boolean not null default false;

-- ------------------------------------------------------------
-- 2. Rebuild the leaderboard views to exclude hidden users
--    (same projections as 0016 — only the visibility filter is new).
-- ------------------------------------------------------------
create or replace view public.leaderboard_global as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.rating,
    p.peak_rating,
    p.rated_count,
    (select count(*) from public.results r where r.user_id = p.id) as tests_completed,
    rank() over (order by p.rating desc, p.rated_count desc) as rank
  from public.profiles p
  where p.rated_count > 0
    and not p.hidden_from_leaderboard;

create or replace view public.leaderboard_weekly as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.rating,
    agg.points,
    agg.tests,
    rank() over (order by agg.points desc) as rank
  from (
    select user_id, sum(points)::int as points, count(*)::int as tests
    from public.results
    where rated
      and submitted_at >= date_trunc('week', (now() at time zone 'utc'))
    group by user_id
  ) agg
  join public.profiles p on p.id = agg.user_id
  where not p.hidden_from_leaderboard;

create or replace view public.leaderboard_monthly as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.rating,
    agg.points,
    agg.tests,
    rank() over (order by agg.points desc) as rank
  from (
    select user_id, sum(points)::int as points, count(*)::int as tests
    from public.results
    where rated
      and submitted_at >= date_trunc('month', (now() at time zone 'utc'))
    group by user_id
  ) agg
  join public.profiles p on p.id = agg.user_id
  where not p.hidden_from_leaderboard;

grant select on public.leaderboard_global  to authenticated;
grant select on public.leaderboard_weekly  to authenticated;
grant select on public.leaderboard_monthly to authenticated;

-- ------------------------------------------------------------
-- 3. Admin-only toggle (SECURITY DEFINER; enforced in the DB)
-- ------------------------------------------------------------
create or replace function public.set_leaderboard_hidden(target_email text, hidden boolean)
returns table (id uuid, email text, name text, hidden_from_leaderboard boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_id     uuid;
begin
  if not public.is_admin(v_caller) then
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
$$;

grant execute on function public.set_leaderboard_hidden(text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 4. Block users from unhiding themselves via the public API
--    (extends protect_profile_privileged_fields from 0014/0019).
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
       or new.hidden_from_leaderboard is distinct from old.hidden_from_leaderboard
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
