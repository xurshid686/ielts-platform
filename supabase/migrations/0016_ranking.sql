-- ============================================================
-- IELTS Platform — 0016: Reading Ranking & Leaderboard system
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent where practical).
-- ============================================================
-- WHAT THIS ADDS
--   • A competitive RATING for Reading (Elo-style, Bronze … Legend tiers).
--   • Anti-cheat: only the FIRST attempt of a server-graded test is rated;
--     unrealistically fast runs are flagged and earn no rating/points.
--   • Weekly + monthly POINTS (always >= 0) so new users can rank from day one.
--   • Achievements catalogue + per-user unlock ledger (with dates).
--   • Leaderboard + profile-stats VIEWS (safe public projection, no emails).
--
-- The rating maths lives in ONE trusted place — public.apply_rating() — which
-- runs SECURITY DEFINER and is the only path allowed to touch rating columns
-- (the 0014 trigger blocks clients from writing them directly). The TypeScript
-- in src/lib/rating.ts is a faithful MIRROR used only for display + tests.
-- ============================================================

set check_function_bodies = off;

-- ============================================================
-- 1. SCHEMA — new columns
-- ============================================================

-- Profiles: the competitive standing.
alter table public.profiles
  add column if not exists rating       int not null default 1000,  -- current rating
  add column if not exists peak_rating  int not null default 1000,  -- highest ever reached
  add column if not exists rated_count  int not null default 0;     -- # of rated (first-attempt) tests

-- Tests: a self-tuning difficulty rating (Elo scale). 1500 = "average".
alter table public.tests
  add column if not exists difficulty int not null default 1500;

-- Results: per-attempt rating + anti-cheat bookkeeping.
alter table public.results
  add column if not exists duration_seconds int,                       -- time spent (client-reported)
  add column if not exists rated         boolean not null default false, -- did this attempt move the rating?
  add column if not exists points        int     not null default 0,     -- weekly/monthly points earned (>=0)
  add column if not exists rating_before int,                            -- snapshot for the history graph
  add column if not exists rating_after  int,
  add column if not exists rating_delta  int,
  add column if not exists flagged       boolean not null default false, -- suspicious (e.g. impossibly fast)
  add column if not exists flag_reason   text;

-- Fast leaderboards / history lookups.
create index if not exists results_rated_idx
  on public.results (submitted_at desc) where rated;
create index if not exists profiles_rating_idx
  on public.profiles (rating desc) where rated_count > 0;

-- The 0014 guard must also protect the new economy columns from REST writes.
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
       or new.rating            is distinct from old.rating
       or new.peak_rating       is distinct from old.peak_rating
       or new.rated_count       is distinct from old.rated_count
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. ACHIEVEMENTS — catalogue + per-user unlock ledger
-- ============================================================
create table if not exists public.achievements (
  id          text primary key,        -- stable slug, e.g. 'reach_gold'
  name        text not null,
  description text not null,
  icon        text not null default '🏆',
  category    text not null check (category in ('rating','activity','accuracy','streak')),
  threshold   int,                      -- generic numeric goal (rating / count / %), nullable
  sort        int  not null default 0
);
alter table public.achievements enable row level security;

drop policy if exists "achievements_read_all" on public.achievements;
create policy "achievements_read_all" on public.achievements
  for select to authenticated using (true);

create table if not exists public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
alter table public.user_achievements enable row level security;
create index if not exists user_achievements_user_idx on public.user_achievements(user_id);

drop policy if exists "user_achievements_select_owner_or_admin" on public.user_achievements;
create policy "user_achievements_select_owner_or_admin" on public.user_achievements
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
-- No client INSERT policy: unlocks are written only by SECURITY DEFINER funcs.

-- Seed the catalogue (idempotent).
insert into public.achievements (id, name, description, icon, category, threshold, sort) values
  -- Accuracy
  ('perfect_1',   'Perfect Score',     'Score 100% on a reading test.',                  '💯', 'accuracy', 1,   10),
  ('perfect_3',   'Triple Perfect',    'Score 100% on three reading tests.',             '🎯', 'accuracy', 3,   11),
  ('perfect_10',  'Perfectionist',     'Score 100% on ten reading tests.',               '🏅', 'accuracy', 10,  12),
  -- Activity
  ('tests_10',    'Getting Serious',   'Complete 10 reading tests.',                     '📚', 'activity', 10,  20),
  ('tests_50',    'Bookworm',          'Complete 50 reading tests.',                     '🐛', 'activity', 50,  21),
  ('tests_100',   'Centurion',         'Complete 100 reading tests.',                    '🏛️', 'activity', 100, 22),
  -- Streak
  ('streak_7',    'On Fire',           'Reach a 7-day streak.',                          '🔥', 'streak',   7,   30),
  ('streak_30',   'Unstoppable',       'Reach a 30-day streak.',                         '⚡', 'streak',   30,  31),
  ('streak_100',  'Centenarian',       'Reach a 100-day streak.',                        '🌋', 'streak',   100, 32),
  -- Rating
  ('reach_gold',  'Gold League',       'Reach a rating of 1500 (Gold).',                 '🥇', 'rating',   1500, 40),
  ('reach_plat',  'Platinum League',   'Reach a rating of 1800 (Platinum).',             '💠', 'rating',   1800, 41),
  ('reach_diamond','Diamond League',   'Reach a rating of 2100 (Diamond).',              '💎', 'rating',   2100, 42),
  ('reach_gm',    'Grandmaster',       'Reach a rating of 2700 (Grandmaster).',          '👑', 'rating',   2700, 43)
on conflict (id) do update
  set name = excluded.name, description = excluded.description,
      icon = excluded.icon, category = excluded.category,
      threshold = excluded.threshold, sort = excluded.sort;

-- Award helper — the only writer of user_achievements.
create or replace function public.grant_achievement(p_user uuid, p_achievement text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_achievements (user_id, achievement_id)
  values (p_user, p_achievement)
  on conflict do nothing;
$$;

-- ============================================================
-- 3. RATING ENGINE
-- ============================================================
-- Elo expectation that the player (rating R) "out-scores" a test (difficulty D).
create or replace function public.rating_expected(p_rating int, p_difficulty int)
returns double precision
language sql immutable
as $$
  select 1.0 / (1.0 + power(10.0, (p_difficulty - p_rating) / 400.0));
$$;

-- K-factor: provisional players move fast; elite players move slowly.
create or replace function public.rating_kfactor(p_rating int, p_rated_count int)
returns int
language sql immutable
as $$
  select case
    when p_rated_count < 10 then 48   -- placement / provisional
    when p_rating < 2000    then 32
    when p_rating < 2400    then 24
    else 16
  end;
$$;

-- ------------------------------------------------------------
-- apply_rating(result_id): grade the standing impact of ONE result.
-- Idempotent per result. Encapsulates every anti-cheat rule.
-- Returns the new rating + the delta + points earned.
-- ------------------------------------------------------------
create or replace function public.apply_rating(p_result_id uuid)
returns table (rated boolean, rating int, rating_delta int, points int, flagged boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r            public.results%rowtype;
  t            public.tests%rowtype;
  v_uid        uuid;
  v_rating     int;
  v_peak       int;
  v_count      int;
  v_total      int;
  v_acc        double precision;
  v_expected   double precision;
  v_k          int;
  v_delta      int;
  v_points     int;
  v_consistency double precision;
  v_recent_acc double precision;
  v_min_seconds int;
  v_prior      int;
  v_today_rated int;
  v_flagged    boolean := false;
  v_reason     text := null;
begin
  select * into r from public.results where id = p_result_id;
  if not found then
    return query select false, null::int, 0, 0, false, 'result not found'; return;
  end if;

  -- Already processed? Stay idempotent (don't double-count on retries).
  if r.rated or r.flagged then
    return query select r.rated, null::int, coalesce(r.rating_delta,0), r.points, r.flagged, 'already processed'; return;
  end if;

  v_uid := r.user_id;

  -- Rating only applies to READING attempts on a real, server-graded test.
  if r.skill <> 'reading' or r.test_id is null then
    return query select false, null::int, 0, 0, false, 'not a rated skill'; return;
  end if;

  select * into t from public.tests where id = r.test_id;
  if not found or t.answer_key is null then
    -- Keyless tests can be faked client-side -> never rated.
    return query select false, null::int, 0, 0, false, 'test has no answer key'; return;
  end if;

  -- (A) FIRST ATTEMPT ONLY. Re-takes are practice: no rating, no points.
  select count(*) into v_prior
  from public.results
  where user_id = v_uid and test_id = r.test_id and id <> r.id
    and submitted_at <= r.submitted_at;
  if v_prior > 0 then
    update public.results set rated = false, points = 0 where id = r.id;
    return query select false, null::int, 0, 0, false, 'retake (practice only)'; return;
  end if;

  v_total := greatest(coalesce(r.total, 1), 1);
  v_acc   := least(1.0, greatest(0.0, coalesce(r.raw, 0)::double precision / v_total));

  -- (B) UNREALISTICALLY FAST -> flag, no rating, no points (still saved as practice).
  --     Floor of ~3s per question, minimum 20s overall.
  v_min_seconds := greatest(20, v_total * 3);
  if r.duration_seconds is not null and r.duration_seconds < v_min_seconds then
    v_flagged := true;
    v_reason  := 'completed too fast (' || r.duration_seconds || 's < ' || v_min_seconds || 's)';
  end if;

  -- (C) DAILY FARM CAP — at most 15 rated tests per UTC day.
  if not v_flagged then
    select count(*) into v_today_rated
    from public.results res
    where res.user_id = v_uid and res.rated
      and (res.submitted_at at time zone 'utc')::date = (r.submitted_at at time zone 'utc')::date;
    if v_today_rated >= 15 then
      v_flagged := true;
      v_reason  := 'daily rated-test cap reached';
    end if;
  end if;

  if v_flagged then
    update public.results
      set rated = false, points = 0, flagged = true, flag_reason = v_reason
      where id = r.id;
    return query select false, null::int, 0, 0, true, v_reason; return;
  end if;

  -- ---- Standing snapshot ----
  select pr.rating, pr.peak_rating, pr.rated_count
    into v_rating, v_peak, v_count
  from public.profiles pr where pr.id = v_uid for update;
  v_rating := coalesce(v_rating, 1000);
  v_peak   := coalesce(v_peak, v_rating);
  v_count  := coalesce(v_count, 0);

  -- ---- Elo delta ----
  v_expected := public.rating_expected(v_rating, t.difficulty);
  v_k        := public.rating_kfactor(v_rating, v_count);
  v_delta    := round(v_k * (v_acc - v_expected));

  -- ---- Consistency reward (applied to GAINS only) ----
  -- Mean accuracy of the user's last up-to-5 rated reading tests.
  select avg(x.acc) into v_recent_acc from (
    select least(1.0, greatest(0.0, coalesce(res.raw,0)::double precision / greatest(coalesce(res.total,1),1))) as acc
    from public.results res
    where res.user_id = v_uid and res.rated and res.skill = 'reading'
    order by res.submitted_at desc
    limit 5
  ) x;
  v_consistency := case
    when v_recent_acc is null then 1.0
    when v_recent_acc >= 0.75 then 1.15
    when v_recent_acc >= 0.60 then 1.05
    else 1.0
  end;
  if v_delta > 0 then
    v_delta := round(v_delta * v_consistency);
  end if;

  -- ---- Clamp the per-test swing ----
  v_delta := greatest(-40, least(50, v_delta));

  -- ---- Weekly/monthly POINTS (never negative; rewards high accuracy & hard tests) ----
  v_points := greatest(1, round(
    power(v_acc, 1.5) * 100.0 * least(1.8, greatest(0.6, t.difficulty / 1500.0))
  ));

  -- ---- Persist on the result (history graph reads these) ----
  update public.results
    set rated = true,
        points = v_points,
        rating_before = v_rating,
        rating_after  = v_rating + v_delta,
        rating_delta  = v_delta
    where id = r.id;

  -- ---- Persist on the profile ----
  update public.profiles
    set rating      = v_rating + v_delta,
        peak_rating = greatest(v_peak, v_rating + v_delta),
        rated_count = v_count + 1
    where id = v_uid;
  v_rating := v_rating + v_delta;

  -- ---- Self-tune this test's difficulty from first-attempt accuracies ----
  perform public.recalc_test_difficulty(r.test_id);

  -- ---- Award achievements reachable from this event ----
  if v_rating >= 1500 then perform public.grant_achievement(v_uid, 'reach_gold'); end if;
  if v_rating >= 1800 then perform public.grant_achievement(v_uid, 'reach_plat'); end if;
  if v_rating >= 2100 then perform public.grant_achievement(v_uid, 'reach_diamond'); end if;
  if v_rating >= 2700 then perform public.grant_achievement(v_uid, 'reach_gm'); end if;

  if v_acc >= 1.0 then
    declare v_perfect int;
    begin
      select count(*) into v_perfect from public.results res
      where res.user_id = v_uid and res.rated and res.skill = 'reading'
        and res.total > 0 and res.raw = res.total;
      if v_perfect >= 1  then perform public.grant_achievement(v_uid, 'perfect_1');  end if;
      if v_perfect >= 3  then perform public.grant_achievement(v_uid, 'perfect_3');  end if;
      if v_perfect >= 10 then perform public.grant_achievement(v_uid, 'perfect_10'); end if;
    end;
  end if;

  if v_count + 1 >= 10  then perform public.grant_achievement(v_uid, 'tests_10');  end if;
  if v_count + 1 >= 50  then perform public.grant_achievement(v_uid, 'tests_50');  end if;
  if v_count + 1 >= 100 then perform public.grant_achievement(v_uid, 'tests_100'); end if;

  return query select true, v_rating, v_delta, v_points, false, null::text;
end;
$$;

-- ------------------------------------------------------------
-- recalc_test_difficulty(test_id): difficulty from first-attempt accuracy.
-- Easy tests (everyone aces them) sink toward 800; hard tests rise toward 2600.
-- Needs >= 5 distinct first-attempt scores before it overrides the 1500 default.
-- ------------------------------------------------------------
create or replace function public.recalc_test_difficulty(p_test_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   int;
  v_avg double precision;
  v_diff int;
begin
  -- One (earliest) attempt per user.
  with firsts as (
    select distinct on (user_id)
      least(1.0, greatest(0.0, coalesce(raw,0)::double precision / greatest(coalesce(total,1),1))) as acc
    from public.results
    where test_id = p_test_id and skill = 'reading' and total > 0
    order by user_id, submitted_at asc
  )
  select count(*), avg(acc) into v_n, v_avg from firsts;

  if v_n is null or v_n < 5 then
    return; -- not enough signal yet; keep current/default difficulty
  end if;

  -- avg acc 0.6 -> 1500; lower avg -> harder (higher) difficulty.
  v_diff := round(1500 + (0.6 - v_avg) * 1800)::int;
  v_diff := greatest(800, least(2600, v_diff));
  update public.tests set difficulty = v_diff where id = p_test_id;
end;
$$;

-- ------------------------------------------------------------
-- rebuild_all_ratings(): wipe and replay every first-attempt READING result
-- in chronological order. Run once after deploy to seed standings from history;
-- also handy if the formula ever changes. Admin/service use only.
-- ------------------------------------------------------------
create or replace function public.rebuild_all_ratings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  -- Reset derived state.
  update public.profiles set rating = 1000, peak_rating = 1000, rated_count = 0;
  update public.results set rated = false, points = 0, rating_before = null,
         rating_after = null, rating_delta = null, flagged = false, flag_reason = null
    where skill = 'reading';
  update public.tests set difficulty = 1500 where skill = 'reading';
  delete from public.user_achievements where achievement_id in
    (select id from public.achievements where category in ('rating','accuracy','activity'));

  -- Replay in submission order.
  for rec in
    select id from public.results
    where skill = 'reading'
    order by submitted_at asc, id asc
  loop
    perform public.apply_rating(rec.id);
  end loop;
end;
$$;

-- ============================================================
-- 4. LEADERBOARD + STATS VIEWS
-- ============================================================
-- These views are owned by the migration runner (table owner) and run with
-- security_invoker = OFF (the default), so they bypass row-level security on
-- profiles/results. That is INTENTIONAL: they expose a deliberately SAFE,
-- read-only projection (no email, no auth data) to every signed-in user so a
-- cross-user leaderboard is possible. Never add private columns here.

-- Global standings — ordered by current rating.
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
  where p.rated_count > 0;

-- Weekly points — resets every Monday (date_trunc('week') starts Monday in PG).
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
  join public.profiles p on p.id = agg.user_id;

-- Monthly points — resets on the 1st.
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
  join public.profiles p on p.id = agg.user_id;

-- Rich per-user statistics for the profile dashboard (owner reads own row;
-- the view itself is RLS-bypassing, so we expose it only to the owner via a
-- WHERE on auth.uid()). Keep this OWNER-SCOPED — it contains no other users.
create or replace view public.profile_stats
with (security_invoker = on) as
  select
    p.id,
    p.rating,
    p.peak_rating,
    p.rated_count,
    (select count(*) from public.results r
       where r.user_id = p.id and r.skill = 'reading') as reading_attempts,
    (select count(*) from public.results r
       where r.user_id = p.id) as total_attempts,
    (select coalesce(sum(r.total), 0) from public.results r
       where r.user_id = p.id and r.skill in ('reading','listening')) as total_questions,
    (select coalesce(sum(r.raw), 0) from public.results r
       where r.user_id = p.id and r.skill in ('reading','listening')) as total_correct,
    (select round(avg(r.band)::numeric, 1) from (
        select distinct on (r2.test_id) r2.band
        from public.results r2
        where r2.user_id = p.id and r2.skill = 'reading' and r2.band is not null
        order by r2.test_id, r2.submitted_at asc
      ) r) as first_attempt_avg_band,
    (select max(r.band) from public.results r
       where r.user_id = p.id and r.skill = 'reading') as best_band
  from public.profiles p;

-- Grants: signed-in users may read the leaderboards; profile_stats is RLS-scoped.
grant select on public.leaderboard_global  to authenticated;
grant select on public.leaderboard_weekly  to authenticated;
grant select on public.leaderboard_monthly to authenticated;
grant select on public.profile_stats        to authenticated;

-- ============================================================
-- 5. ONE-TIME BACKFILL — seed standings from existing history.
-- ============================================================
select public.rebuild_all_ratings();

-- ============================================================
-- DONE.
-- Quick checks:
--   select name, rating, rated_count from public.profiles order by rating desc;
--   select * from public.leaderboard_global;
--   select * from public.leaderboard_weekly;
-- To re-seed after changing the formula:  select public.rebuild_all_ratings();
-- ============================================================
