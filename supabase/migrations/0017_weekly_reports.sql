-- ============================================================
-- IELTS Platform — 0017: Weekly progress reports + notifications
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent where practical).
-- ============================================================
-- WHAT THIS ADDS
--   • notifications  — a generic in-app inbox (bell in the header).
--   • weekly_reports — one progress digest per user per ISO week (Mon–Sun):
--       tests completed, avg/best band, accuracy, rating change, points,
--       streak, new achievements.
--   • Lazy delivery: ensure_weekly_report() runs on every page load and, on
--     the week's Sunday (or the days after, if the user wasn't around), creates
--     that week's report + a notification — exactly once.
--   • Admin override: admin_send_weekly_report(user[, week]) lets an admin send
--     a report any day, even outside the normal Sunday schedule.
--
-- build_weekly_report() is the single place the digest is computed. It is
-- INTERNAL (execute revoked from clients) and reached only through the two
-- gated entry points above, both SECURITY DEFINER.
-- ============================================================

set check_function_bodies = off;

-- ============================================================
-- 1. NOTIFICATIONS — generic in-app inbox
-- ============================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'info',  -- 'weekly_report' | 'info' | …
  title      text not null,
  body       text,
  data       jsonb,                          -- type-specific payload (e.g. report_id)
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

-- Users may only flip their own notifications' read state (handy + harmless).
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);
-- No INSERT policy: rows are written only by SECURITY DEFINER functions.

-- ============================================================
-- 2. WEEKLY REPORTS — one digest per user per week
-- ============================================================
create table if not exists public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  period_start     date not null,            -- Monday (date_trunc('week'))
  period_end       date not null,            -- Sunday
  tests_completed  int  not null default 0,
  avg_band         numeric(3,1),
  best_band        numeric(3,1),
  avg_accuracy     int,                       -- percent, or null
  points           int  not null default 0,   -- weekly points earned
  rating_start     int,
  rating_end       int,
  rating_delta     int  not null default 0,
  new_achievements int  not null default 0,
  streak           int  not null default 0,
  generated_by     text not null default 'auto' check (generated_by in ('auto','admin')),
  created_at       timestamptz not null default now(),
  unique (user_id, period_start)
);
alter table public.weekly_reports enable row level security;
create index if not exists weekly_reports_user_idx
  on public.weekly_reports (user_id, period_start desc);

drop policy if exists "weekly_reports_select_own_or_admin" on public.weekly_reports;
create policy "weekly_reports_select_own_or_admin" on public.weekly_reports
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
-- No client write policies: rows are written only by SECURITY DEFINER functions.

-- ============================================================
-- 3. build_weekly_report() — compute + store a digest, post a notification.
--    INTERNAL. Returns the report id. Upserts on (user, week) so re-sending
--    refreshes the numbers rather than duplicating.
-- ============================================================
create or replace function public.build_weekly_report(
  p_user uuid,
  p_period_start date,
  p_generated_by text default 'auto'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start   timestamptz := (p_period_start::timestamp at time zone 'utc');
  v_end     timestamptz := ((p_period_start + 7)::timestamp at time zone 'utc');
  v_tests   int;
  v_avg     numeric;
  v_best    numeric;
  v_acc     int;
  v_points  int;
  v_rstart  int;
  v_rend    int;
  v_rdelta  int;
  v_newach  int;
  v_streak  int;
  v_curr    int;
  v_report  uuid;
begin
  -- Scored attempts (reading + listening) inside the week.
  select count(*),
         round(avg(band)::numeric, 1),
         max(band),
         case when sum(case when total > 0 then total else 0 end) > 0
              then round(100.0 * sum(case when total > 0 then raw else 0 end)
                               / sum(case when total > 0 then total else 0 end))::int
              else null end
    into v_tests, v_avg, v_best, v_acc
  from public.results
  where user_id = p_user and skill in ('reading','listening')
    and submitted_at >= v_start and submitted_at < v_end;

  select coalesce(sum(points), 0) into v_points
  from public.results
  where user_id = p_user and rated
    and submitted_at >= v_start and submitted_at < v_end;

  -- Rating movement across the week (first/last rated reading attempt).
  select rating_before into v_rstart from public.results
   where user_id = p_user and rated and skill = 'reading' and rating_before is not null
     and submitted_at >= v_start and submitted_at < v_end
   order by submitted_at asc limit 1;
  select rating_after into v_rend from public.results
   where user_id = p_user and rated and skill = 'reading' and rating_after is not null
     and submitted_at >= v_start and submitted_at < v_end
   order by submitted_at desc limit 1;

  select rating, streak into v_curr, v_streak from public.profiles where id = p_user;
  v_rstart := coalesce(v_rstart, v_curr, 1000);
  v_rend   := coalesce(v_rend, v_curr, 1000);
  v_rdelta := v_rend - v_rstart;

  select count(*) into v_newach from public.user_achievements
   where user_id = p_user and earned_at >= v_start and earned_at < v_end;

  insert into public.weekly_reports as wr
    (user_id, period_start, period_end, tests_completed, avg_band, best_band,
     avg_accuracy, points, rating_start, rating_end, rating_delta,
     new_achievements, streak, generated_by)
  values
    (p_user, p_period_start, p_period_start + 6, coalesce(v_tests, 0), v_avg, v_best,
     v_acc, coalesce(v_points, 0), v_rstart, v_rend, v_rdelta,
     coalesce(v_newach, 0), coalesce(v_streak, 0), p_generated_by)
  on conflict (user_id, period_start) do update
    set tests_completed  = excluded.tests_completed,
        avg_band         = excluded.avg_band,
        best_band        = excluded.best_band,
        avg_accuracy     = excluded.avg_accuracy,
        points           = excluded.points,
        rating_start     = excluded.rating_start,
        rating_end       = excluded.rating_end,
        rating_delta     = excluded.rating_delta,
        new_achievements = excluded.new_achievements,
        streak           = excluded.streak,
        generated_by     = excluded.generated_by,
        created_at       = now()
  returning wr.id into v_report;

  -- Inbox notification linking back to the full report.
  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_user,
    'weekly_report',
    'Your weekly report is ready 📊',
    'You completed ' || coalesce(v_tests, 0) || ' test'
      || case when coalesce(v_tests, 0) = 1 then '' else 's' end
      || case when v_avg is not null then ' · avg band ' || v_avg else '' end
      || case when v_best is not null then ' · best ' || v_best else '' end || '.',
    jsonb_build_object(
      'report_id', v_report,
      'period_start', p_period_start,
      'tests', coalesce(v_tests, 0),
      'avg_band', v_avg,
      'best_band', v_best,
      'rating_delta', v_rdelta,
      'points', coalesce(v_points, 0)
    )
  );

  return v_report;
end;
$$;

-- ============================================================
-- 4. ensure_weekly_report() — lazy, once-a-week auto delivery for the caller.
--    Called on each page load; cheap and idempotent.
-- ============================================================
create or replace function public.ensure_weekly_report()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := (now() at time zone 'utc')::date;
  v_monday date := date_trunc('week', v_today)::date;  -- Monday of this week
  v_period date;
  v_has    int;
  v_tests  int;
begin
  if v_uid is null then return null; end if;

  -- The most recent week whose Sunday (Monday+6) is today or in the past.
  if v_today >= v_monday + 6 then
    v_period := v_monday;       -- it's Sunday → this week is ready
  else
    v_period := v_monday - 7;   -- earlier in the week → last week is the one due
  end if;

  -- Already delivered this period? Done.
  select count(*) into v_has from public.weekly_reports
   where user_id = v_uid and period_start = v_period;
  if v_has > 0 then return null; end if;

  -- Only auto-send when there was something to report.
  select count(*) into v_tests from public.results
   where user_id = v_uid and skill in ('reading','listening')
     and submitted_at >= (v_period::timestamp at time zone 'utc')
     and submitted_at <  ((v_period + 7)::timestamp at time zone 'utc');
  if coalesce(v_tests, 0) = 0 then return null; end if;

  return public.build_weekly_report(v_uid, v_period, 'auto');
end;
$$;

-- ============================================================
-- 5. admin_send_weekly_report() — manual send, any day. Admin-gated.
--    Defaults to the current ISO week; pass a Monday to target another week.
-- ============================================================
create or replace function public.admin_send_weekly_report(
  p_user uuid,
  p_period_start date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  v_period := coalesce(
    p_period_start,
    date_trunc('week', (now() at time zone 'utc')::date)::date
  );
  return public.build_weekly_report(p_user, v_period, 'admin');
end;
$$;

-- ============================================================
-- 6. EXECUTE GRANTS
-- build_weekly_report is internal — clients reach it only via the gated
-- wrappers (which run as the function owner and so keep access). The wrappers
-- are callable by signed-in users; admin_send_weekly_report self-checks.
-- ============================================================
revoke execute on function public.build_weekly_report(uuid, date, text) from public, anon, authenticated;
grant  execute on function public.ensure_weekly_report()                    to authenticated;
grant  execute on function public.admin_send_weekly_report(uuid, date)      to authenticated;

-- ============================================================
-- DONE.
-- Try it:
--   select public.ensure_weekly_report();                  -- as a signed-in user
--   select public.admin_send_weekly_report('<user-uuid>'); -- as an admin
--   select * from public.weekly_reports order by created_at desc;
--   select * from public.notifications  order by created_at desc;
-- ============================================================
