-- ============================================================
-- IELTS Platform — 0022: Scheduled reminders (cron)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent).
-- ============================================================
-- WHAT THIS ADDS — two SECURITY DEFINER functions a Vercel Cron calls via the
-- service-role client. Both bypass RLS (they run as owner) and are granted ONLY
-- to service_role, so no signed-in user or anon key can invoke them.
--
--   • cron_weekly_reports(week) — builds this week's report for every user who
--     practised during the week and doesn't already have one (reusing the
--     existing build_weekly_report, which also posts the in-app notification),
--     and returns each recipient so the API route can email them.
--
--   • cron_streak_reminders() — for every user with a live streak who hasn't
--     practised yet *today in their own timezone* and hasn't already been
--     nudged today, posts a 'streak_reminder' notification and returns them
--     for an optional email. Idempotent within the day via the notification.
-- ============================================================

set check_function_bodies = off;

-- build_weekly_report is internal (execute revoked from clients in 0017). The
-- cron functions below are SECURITY DEFINER and owned by the same role, so they
-- can call it. No extra grant on build_weekly_report is needed.

-- ============================================================
-- 1. Weekly reports for all active users in a given week.
--    p_week defaults to the Monday of the current ISO week (UTC), which is the
--    right value when the cron fires on Sunday.
-- ============================================================
create or replace function public.cron_weekly_reports(p_week date default null)
returns table (
  user_id   uuid,
  email     text,
  name      text,
  tests     int,
  avg_band  numeric,
  best_band numeric,
  report_id uuid,
  emailed_period date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date;
  r        record;
  v_report uuid;
begin
  v_period := coalesce(
    p_week,
    date_trunc('week', (now() at time zone 'utc')::date)::date  -- Monday this week
  );

  for r in
    select distinct res.user_id as uid
    from public.results res
    where res.skill in ('reading', 'listening')
      and res.submitted_at >= (v_period::timestamp at time zone 'utc')
      and res.submitted_at <  ((v_period + 7)::timestamp at time zone 'utc')
  loop
    select wr.id into v_report
      from public.weekly_reports wr
     where wr.user_id = r.uid and wr.period_start = v_period;

    if v_report is null then
      v_report := public.build_weekly_report(r.uid, v_period, 'auto');
    end if;

    return query
      select p.id, p.email, p.name,
             wr.tests_completed, wr.avg_band, wr.best_band,
             wr.id, v_period
        from public.weekly_reports wr
        join public.profiles p on p.id = wr.user_id
       where wr.id = v_report;
  end loop;
end;
$$;

-- ============================================================
-- 2. Daily streak reminders. One notification per user per local day.
-- ============================================================
create or replace function public.cron_streak_reminders()
returns table (
  user_id uuid,
  email   text,
  name    text,
  streak  int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select p.id as uid, p.email, p.name, p.streak,
           coalesce(p.timezone, 'UTC') as tz
      from public.profiles p
     where coalesce(p.streak, 0) > 0
  loop
    -- Skip if they already practised today (reading/listening/writing results)…
    if exists (
      select 1 from public.results res
       where res.user_id = r.uid
         and (res.submitted_at at time zone r.tz)::date = (now() at time zone r.tz)::date
    ) then
      continue;
    end if;
    -- …or recorded a speaking attempt today…
    if exists (
      select 1 from public.speaking_submissions ss
       where ss.user_id = r.uid
         and (ss.created_at at time zone r.tz)::date = (now() at time zone r.tz)::date
    ) then
      continue;
    end if;
    -- …or were already reminded today.
    if exists (
      select 1 from public.notifications n
       where n.user_id = r.uid and n.type = 'streak_reminder'
         and (n.created_at at time zone r.tz)::date = (now() at time zone r.tz)::date
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      r.uid,
      'streak_reminder',
      '🔥 Keep your ' || r.streak || '-day streak alive',
      'You haven''t practised today — take a quick test to keep your '
        || r.streak || '-day streak going.',
      jsonb_build_object('streak', r.streak)
    );

    return query select r.uid, r.email, r.name, r.streak;
  end loop;
end;
$$;

-- ============================================================
-- 3. EXECUTE GRANTS — service_role only (used by the cron API routes).
-- ============================================================
revoke execute on function public.cron_weekly_reports(date)   from public, anon, authenticated;
revoke execute on function public.cron_streak_reminders()     from public, anon, authenticated;
grant  execute on function public.cron_weekly_reports(date)   to service_role;
grant  execute on function public.cron_streak_reminders()     to service_role;

-- ============================================================
-- DONE.
-- Try it (as service role, e.g. SQL editor):
--   select * from public.cron_weekly_reports();
--   select * from public.cron_streak_reminders();
-- ============================================================
