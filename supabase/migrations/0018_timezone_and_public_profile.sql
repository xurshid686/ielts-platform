-- ============================================================
-- IELTS Platform — 0018: per-user timezone + public shareable profile
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHY
--   • Streaks and the "Sunday" weekly report ran on UTC. Most users are UTC+5
--     (Asia/Tashkent), so their day/week boundaries felt ~5h off. We now store
--     each user's timezone and compute day/week boundaries in THEIR local time.
--   • public_profile() exposes a SAFE, read-only snapshot (rating, tier, history,
--     achievements — no email) so a profile can be shared with anyone, even
--     signed-out visitors, without weakening row-level security.
-- ============================================================

set check_function_bodies = off;

-- ------------------------------------------------------------
-- 1. Timezone column (IANA name, e.g. 'Asia/Tashkent'). Auto-captured from the
--    browser on first load; defaults to UTC until then.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

-- ------------------------------------------------------------
-- 2. record_activity — count the streak day in the USER'S timezone.
--    (Same contract as 0001; only the "today" boundary changes.)
-- ------------------------------------------------------------
create or replace function public.record_activity(p_xp int default 10)
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
begin
  select p.last_activity_date, p.streak, p.longest_streak, coalesce(p.timezone, 'UTC')
    into v_last, v_streak, v_longest, v_tz
  from public.profiles p
  where p.id = auth.uid()
  for update;

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
         xp = p.xp + p_xp
   where p.id = auth.uid();

  return query
    select v_streak, v_longest, (select p.xp from public.profiles p where p.id = auth.uid());
end;
$$;

-- ------------------------------------------------------------
-- 3. build_weekly_report — compute week boundaries in the user's timezone.
--    (Recreated from 0017 with v_tz instead of hard-coded 'utc'.)
-- ------------------------------------------------------------
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
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
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
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = p_user;
  v_tz    := coalesce(v_tz, 'UTC');
  v_start := (p_period_start::timestamp at time zone v_tz);
  v_end   := ((p_period_start + 7)::timestamp at time zone v_tz);

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

-- ------------------------------------------------------------
-- 4. ensure_weekly_report — "today"/"Sunday" in the user's timezone.
-- ------------------------------------------------------------
create or replace function public.ensure_weekly_report()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tz     text;
  v_today  date;
  v_monday date;
  v_period date;
  v_has    int;
  v_tests  int;
begin
  if v_uid is null then return null; end if;

  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_uid;
  v_tz     := coalesce(v_tz, 'UTC');
  v_today  := (now() at time zone v_tz)::date;
  v_monday := date_trunc('week', v_today)::date;

  if v_today >= v_monday + 6 then
    v_period := v_monday;       -- it's Sunday → this week is ready
  else
    v_period := v_monday - 7;   -- earlier in the week → last week is due
  end if;

  select count(*) into v_has from public.weekly_reports
   where user_id = v_uid and period_start = v_period;
  if v_has > 0 then return null; end if;

  select count(*) into v_tests from public.results
   where user_id = v_uid and skill in ('reading','listening')
     and submitted_at >= (v_period::timestamp at time zone v_tz)
     and submitted_at <  ((v_period + 7)::timestamp at time zone v_tz);
  if coalesce(v_tests, 0) = 0 then return null; end if;

  return public.build_weekly_report(v_uid, v_period, 'auto');
end;
$$;

-- ============================================================
-- 5. public_profile(id) — safe, shareable snapshot. SECURITY DEFINER so it can
--    read the (RLS-protected) results/achievements, but returns ONLY non-PII
--    fields. Callable by anyone, including signed-out visitors.
-- ============================================================
create or replace function public.public_profile(p_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',              p.id,
    'name',            p.name,
    'avatar_url',      p.avatar_url,
    'rating',          p.rating,
    'peak_rating',     p.peak_rating,
    'rated_count',     p.rated_count,
    'member_since',    p.created_at,
    'tests_completed', (select count(*) from public.results r where r.user_id = p.id),
    'global_rank',     (select g.rank from public.leaderboard_global g where g.id = p.id),
    'best_band',       (select max(r.band) from public.results r
                          where r.user_id = p.id and r.skill = 'reading'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('r', h.rating_after, 'at', h.submitted_at)
                        order by h.submitted_at)
      from (
        select rating_after, submitted_at from public.results
        where user_id = p.id and rated and skill = 'reading' and rating_after is not null
        order by submitted_at desc limit 30
      ) h
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'name', a.name, 'icon', a.icon,
               'category', a.category, 'earned_at', ua.earned_at)
             order by ua.earned_at)
      from public.user_achievements ua
      join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = p_id;
$$;

grant execute on function public.public_profile(uuid) to anon, authenticated;

-- ============================================================
-- DONE.
--   update public.profiles set timezone = 'Asia/Tashkent' where email = '…'; -- optional manual set
--   select public.public_profile('<user-uuid>');
-- ============================================================
