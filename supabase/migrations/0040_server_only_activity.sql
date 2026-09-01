-- ============================================================
-- IELTS Platform — 0040: a service-role-only way to record activity
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** ADDITIVE ONLY. Safe to run BEFORE or after a deploy. ***
--
-- This migration only ADDS a function. It revokes nothing and changes no
-- existing behaviour, so it cannot take the site down. The revokes that
-- depend on it live in 0041, which must run AFTER the code is deployed.
--
-- WHY
--
-- `record_activity(int)` is `security definer` and granted to `authenticated`
-- (0036:327). It caps a SINGLE call at 30 XP but has no per-day limit, so:
--
--   POST /rest/v1/rpc/record_activity  {"p_xp":30}
--
-- repeated in a loop inflates `profiles.xp` without bound. XP drives badges
-- (src/lib/badges.ts), the shell counter and the leaderboards, and none of
-- saveResult()'s first-attempt / one-retake-per-day rules
-- (src/app/actions/results.ts) are on that path.
--
-- The fix is to take the function away from clients entirely and have the
-- server call it. But `record_activity` reads `auth.uid()`, which is NULL for
-- the service role — it would return early and award nothing. So the server
-- needs a variant that takes the user id explicitly.
--
-- `record_activity_for` is that variant. The body is `record_activity`'s,
-- unchanged, with `auth.uid()` replaced by the parameter. It is granted to
-- `service_role` ONLY: a caller who can reach it already holds the key that
-- bypasses RLS anyway, so the 30-XP cap stays purely as defence in depth.
--
-- `record_activity(int)` is kept and becomes a thin wrapper, so anything not
-- yet migrated keeps working until 0041 revokes it.
--
-- TO ROLL BACK:
--   drop function if exists public.record_activity_for(uuid, int);
--   (and re-run 0036 to restore record_activity's original body)
--
-- ============================================================

set check_function_bodies = off;

-- ------------------------------------------------------------
-- record_activity_for — the real implementation, keyed on an explicit user.
-- ------------------------------------------------------------
create or replace function public.record_activity_for(p_user_id uuid, p_xp int default 10)
returns table (streak int, longest_streak int, xp int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last    date;
  v_streak  int;
  v_longest int;
  v_tz      text;
  v_today   date;
  v_xp      int;
begin
  -- No user, nothing to record. Same guard 0036 added to record_activity.
  if p_user_id is null then
    return;
  end if;

  -- The largest legitimate award is 30 (a speaking mock). Kept as defence in
  -- depth: the only callers left are server-side, which set it themselves.
  v_xp := least(greatest(coalesce(p_xp, 0), 0), 30);

  select p.last_activity_date, p.streak, p.longest_streak, coalesce(p.timezone, 'UTC')
    into v_last, v_streak, v_longest, v_tz
  from public.profiles p
  where p.id = p_user_id
  for update;

  -- Unknown user id: no row was locked, so award nothing.
  if not found then
    return;
  end if;

  v_today := (now() at time zone v_tz)::date;

  if v_last is null or v_last < v_today - 1 then
    v_streak := 1;                 -- first ever, or a day was missed
  elsif v_last = v_today - 1 then
    v_streak := v_streak + 1;      -- consecutive day
  end if;                          -- v_last = v_today -> unchanged

  v_longest := greatest(coalesce(v_longest, 0), v_streak);

  update public.profiles p
     set streak = v_streak,
         longest_streak = v_longest,
         last_activity_date = v_today,
         xp = p.xp + v_xp
   where p.id = p_user_id;

  return query
    select v_streak, v_longest, (select p.xp from public.profiles p where p.id = p_user_id);
end;
$$;

-- Server-side only. Postgres grants EXECUTE to PUBLIC by default (the exact
-- default 0036 was written to undo), so revoke before granting.
revoke execute on function public.record_activity_for(uuid, int) from public, anon, authenticated;
grant  execute on function public.record_activity_for(uuid, int) to service_role;

-- ------------------------------------------------------------
-- record_activity — now a wrapper, so nothing breaks before 0041.
-- ------------------------------------------------------------
create or replace function public.record_activity(p_xp int default 10)
returns table (streak int, longest_streak int, xp int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.record_activity_for(auth.uid(), p_xp);
end;
$$;

-- Grants unchanged here on purpose — 0041 removes them, once the code that
-- calls record_activity_for is live.
revoke execute on function public.record_activity(int) from public, anon;
grant  execute on function public.record_activity(int) to authenticated, service_role;
