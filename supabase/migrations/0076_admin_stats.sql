-- 0076 — admin panel v2: analytics aggregated in SQL (owner, 2026-11-27).
--
-- The old /admin overview pulled every profile through PostgREST to count
-- them, which silently stopped at 1000 rows while the site had ~1,200
-- accounts. Everything the new overview, the activity feed and the tests
-- table show is aggregated here instead, so no number is ever a page cap.
--
-- ADDITIVE and READ-ONLY. Three functions, no tables, no writes. Each one is
-- SECURITY DEFINER (it reads tables that have no grants: payment_orders,
-- premium_passes, test_reports, mock_attempts…) and refuses anyone who is not
-- is_admin(auth.uid()). No email is returned by the feed: names only, plus the
-- user id the panel links to.
--
-- Dates are bucketed in Asia/Tashkent, the zone the owner and the passes week
-- (0069) use.

create or replace function public.admin_dashboard_stats(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  d int := greatest(1, least(coalesce(p_days, 30), 365));
  tz text := 'Asia/Tashkent';
  t_now timestamptz := now();
  cur_from timestamptz := now() - make_interval(days => d);
  prev_from timestamptz := now() - make_interval(days => 2 * d);
  out jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with
  totals as (
    select jsonb_build_object(
      'accounts',        (select count(*) from profiles),
      'new_7d',          (select count(*) from profiles where created_at > t_now - interval '7 days'),
      'new_30d',         (select count(*) from profiles where created_at > t_now - interval '30 days'),
      'premium_active',  (select count(*) from profiles where premium_until > t_now),
      'ultima_active',   (select count(*) from ultima_members where ultima_until > t_now),
      'trials_active',   (select count(*) from premium_trials where ends_at > t_now),
      'results_total',   (select count(*) from results),
      'tests_total',     (select count(*) from tests),
      'premium_expiring_7d', (select count(*) from profiles
                              where premium_until > t_now and premium_until <= t_now + interval '7 days'),
      -- Backlog age (Grok + agy both named the owner's queue as the KPI that
      -- matters most): the oldest thing still waiting on the owner.
      'oldest_ungraded_at', (select min(submitted_at) from mock_attempts where status = 'submitted'),
      'oldest_open_report_at', (select min(created_at) from test_reports where status = 'open'),
      'orders_stuck', (select count(*) from payment_orders
                       where status in ('created', 'pending') and created_at < t_now - interval '1 hour'
                         and created_at > t_now - interval '7 days')
    ) j
  ),
  -- The same five numbers for the window and the one before it, for deltas.
  period as (
    select jsonb_build_object(
      'cur', jsonb_build_object(
        'signups',  (select count(*) from profiles where created_at > cur_from),
        'activated', (select count(*) from profiles p where p.created_at > cur_from
                      and exists (select 1 from results r where r.user_id = p.id
                                  and r.submitted_at < p.created_at + interval '7 days')),
        'results',  (select count(*) from results where submitted_at > cur_from),
        'active',   (select count(distinct user_id) from results where submitted_at > cur_from),
        'paid',     (select count(*) from payment_orders where status = 'paid' and paid_at > cur_from),
        'revenue',  (select coalesce(sum(amount_tiyin), 0) / 100 from payment_orders
                     where status = 'paid' and paid_at > cur_from),
        'passes',   (select count(*) from premium_passes where created_at > cur_from),
        'trials',   (select count(*) from premium_trials where started_at > cur_from)
      ),
      'prev', jsonb_build_object(
        'signups',  (select count(*) from profiles where created_at > prev_from and created_at <= cur_from),
        'activated', (select count(*) from profiles p where p.created_at > prev_from and p.created_at <= cur_from
                      and exists (select 1 from results r where r.user_id = p.id
                                  and r.submitted_at < p.created_at + interval '7 days')),
        'results',  (select count(*) from results where submitted_at > prev_from and submitted_at <= cur_from),
        'active',   (select count(distinct user_id) from results
                     where submitted_at > prev_from and submitted_at <= cur_from),
        'paid',     (select count(*) from payment_orders
                     where status = 'paid' and paid_at > prev_from and paid_at <= cur_from),
        'revenue',  (select coalesce(sum(amount_tiyin), 0) / 100 from payment_orders
                     where status = 'paid' and paid_at > prev_from and paid_at <= cur_from),
        'passes',   (select count(*) from premium_passes where created_at > prev_from and created_at <= cur_from),
        'trials',   (select count(*) from premium_trials
                     where started_at > prev_from and started_at <= cur_from)
      )
    ) j
  ),
  days as (
    select generate_series(
      (t_now at time zone tz)::date - (d - 1),
      (t_now at time zone tz)::date,
      interval '1 day'
    )::date as dy
  ),
  s_signups as (
    select (created_at at time zone tz)::date dy, count(*) n
    from profiles where created_at > t_now - make_interval(days => d + 1) group by 1
  ),
  s_results as (
    select (submitted_at at time zone tz)::date dy, count(*) n, count(distinct user_id) a
    from results where submitted_at > t_now - make_interval(days => d + 1) group by 1
  ),
  s_paid as (
    select (paid_at at time zone tz)::date dy, count(*) n, coalesce(sum(amount_tiyin), 0) / 100 uzs
    from payment_orders where status = 'paid' and paid_at > t_now - make_interval(days => d + 1) group by 1
  ),
  s_passes as (
    select (created_at at time zone tz)::date dy, count(*) n
    from premium_passes where created_at > t_now - make_interval(days => d + 1) group by 1
  ),
  series as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day',     days.dy,
      'signups', coalesce(s_signups.n, 0),
      'results', coalesce(s_results.n, 0),
      'active',  coalesce(s_results.a, 0),
      'paid',    coalesce(s_paid.n, 0),
      'revenue', coalesce(s_paid.uzs, 0),
      'passes',  coalesce(s_passes.n, 0)
    ) order by days.dy), '[]'::jsonb) j
    from days
    left join s_signups on s_signups.dy = days.dy
    left join s_results on s_results.dy = days.dy
    left join s_paid on s_paid.dy = days.dy
    left join s_passes on s_passes.dy = days.dy
  ),
  -- Ported from scripts/growth-kpis.mjs: signup week -> took a test ->
  -- came back on 2+ days -> ever premium. Last 8 weeks.
  cohorts as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'week', wk, 'signups', signups, 'took_test', took, 'returned', returned, 'premium', premium
    ) order by wk), '[]'::jsonb) j
    from (
      select date_trunc('week', p.created_at at time zone tz)::date wk,
             count(*) signups,
             count(r.user_id) took,
             count(*) filter (where r.days >= 2) returned,
             count(*) filter (where p.premium_until is not null) premium
      from profiles p
      left join (
        select user_id, count(distinct (submitted_at at time zone tz)::date) days
        from results group by user_id
      ) r on r.user_id = p.id
      where p.created_at > t_now - interval '8 weeks'
      group by 1
    ) c
  ),
  catalogue as (
    select coalesce(jsonb_agg(jsonb_build_object('skill', skill, 'tier', tier, 'n', n)
             order by skill, tier), '[]'::jsonb) j
    from (
      select skill, tier, count(*) n from tests
      where coalesce(track, 'regular') = 'regular' group by 1, 2
    ) c
  )
  select jsonb_build_object(
    'days', d,
    'totals', (select j from totals),
    'period', (select j from period),
    'series', (select j from series),
    'cohorts', (select j from cohorts),
    'catalogue', (select j from catalogue)
  ) into out;

  return out;
end
$fn$;

-- The live feed: the newest events of five kinds, merged by time.
create or replace function public.admin_recent_activity(p_limit int default 40)
returns table (
  kind text,
  at timestamptz,
  user_id uuid,
  name text,
  label text,
  detail text,
  ref_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  n int := greatest(1, least(coalesce(p_limit, 40), 200));
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select * from (
    (select 'signup'::text, p.created_at, p.id, p.name, null::text, null::text, null::uuid
       from profiles p order by p.created_at desc limit n)
    union all
    (select 'result'::text, r.submitted_at, r.user_id, p.name, t.title,
            concat_ws(' · ', r.raw || '/' || r.total, case when r.band is not null then 'band ' || r.band end),
            r.id
       from results r
       left join profiles p on p.id = r.user_id
       left join tests t on t.id = r.test_id
       order by r.submitted_at desc limit n)
    union all
    (select 'payment'::text, o.paid_at, o.user_id, coalesce(p.name, o.email_snapshot),
            initcap(coalesce(o.plan, 'premium')) || ' · ' || o.months || ' mo',
            to_char(o.amount_tiyin / 100, 'FM999G999G999') || ' so''m · ' || o.provider,
            o.id
       from payment_orders o
       left join profiles p on p.id = o.user_id
       where o.status = 'paid' and o.paid_at is not null
       order by o.paid_at desc limit n)
    union all
    (select 'mock'::text, a.submitted_at, a.user_id, coalesce(p.name, a.student_name), m.title,
            a.status, a.id
       from mock_attempts a
       left join profiles p on p.id = a.user_id
       left join mocks m on m.id = a.mock_id
       where a.submitted_at is not null
       order by a.submitted_at desc limit n)
    union all
    (select 'report'::text, tr.created_at, tr.user_id, p.name, t.title,
            tr.category || ' · ' || tr.status, tr.id
       from test_reports tr
       left join profiles p on p.id = tr.user_id
       left join tests t on t.id = tr.test_id
       order by tr.created_at desc limit n)
  ) feed (kind, at, user_id, name, label, detail, ref_id)
  where feed.at is not null
  order by feed.at desc
  limit n;
end
$fn$;

-- Per-test numbers for the admin tests table, one row per test.
create or replace function public.admin_test_stats()
returns table (
  test_id uuid,
  attempts bigint,
  students bigint,
  avg_band numeric,
  avg_accuracy numeric,
  open_reports bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select t.id,
         coalesce(r.attempts, 0),
         coalesce(r.students, 0),
         r.avg_band,
         r.avg_accuracy,
         coalesce(rep.open_reports, 0)
  from tests t
  left join (
    select test_id,
           count(*) attempts,
           count(distinct user_id) students,
           round(avg(band)::numeric, 1) avg_band,
           round(avg(case when total > 0 then raw::numeric / total end) * 100, 0) avg_accuracy
    from results where test_id is not null group by test_id
  ) r on r.test_id = t.id
  left join (
    select test_id, count(*) open_reports from test_reports where status = 'open' group by test_id
  ) rep on rep.test_id = t.id;
end
$fn$;

revoke all on function public.admin_dashboard_stats(int) from public, anon;
revoke all on function public.admin_recent_activity(int) from public, anon;
revoke all on function public.admin_test_stats() from public, anon;
grant execute on function public.admin_dashboard_stats(int) to authenticated;
grant execute on function public.admin_recent_activity(int) to authenticated;
grant execute on function public.admin_test_stats() to authenticated;
