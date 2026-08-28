-- ============================================================
-- IELTS Platform — 0036: stop strangers executing privileged functions
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** BACKWARD COMPATIBLE. Safe to run before or after a deploy. ***
--
-- WHAT WAS WRONG
--
-- Postgres grants EXECUTE to PUBLIC by default. 0017 and 0022 correctly
-- revoked the cron helpers, which shows the default was understood — but the
-- ranking and activity functions were never revoked. Confirmed against
-- production using nothing but the ANON key:
--
--   POST /rest/v1/rpc/record_activity      {"p_xp":1}
--     -> 200 [{"streak":1,...}]                  (executed)
--   POST /rest/v1/rpc/rebuild_all_ratings  {}
--     -> 21000 "UPDATE requires a WHERE clause"  (entered the body)
--   POST /rest/v1/rpc/grant_achievement    {...}
--     -> 23503 foreign key violation             (reached the INSERT)
--
-- None of those are permission errors. Every call passed the gate and ran.
-- `grant_achievement` failed only because the user id was fake; a real one
-- would have inserted. `rebuild_all_ratings` rewrites EVERY rating on the
-- site and had no admin check of its own.
--
-- Revoking the grant is necessary but not sufficient: two of these stay
-- reachable by any signed-in member, so their bodies are hardened too.
--
-- WHAT THE APP CALLS, and therefore what keeps its grant:
--   record_activity  — results.ts:253 (0/5/10/20 XP), speaking.ts:126 (30 XP)
--   apply_rating     — results.ts:227, with the id of the row just inserted
-- Nothing anonymous needs either. /api/guest-grade persists nothing.
--
-- grant_achievement / recalc_test_difficulty / rebuild_all_ratings become
-- service-role only. The first two are called with `perform` from inside
-- apply_rating, which is SECURITY DEFINER and so runs them as the owner —
-- revoking them from `authenticated` does not break that path.
--
-- TO ROLL BACK:
--   grant execute on function public.record_activity(int)           to public;
--   grant execute on function public.apply_rating(uuid)             to public;
--   grant execute on function public.grant_achievement(uuid, text)  to public;
--   grant execute on function public.recalc_test_difficulty(uuid)   to public;
--   grant execute on function public.rebuild_all_ratings()          to public;
-- (and re-run 0018 / 0016 to restore the unhardened bodies)
--
-- ============================================================


-- ------------------------------------------------------------
-- 1. record_activity — ignore anonymous callers, cap self-awarded XP.
--    Recreated from 0018 (the timezone-aware version). The body is unchanged
--    apart from the two guards at the top and using v_xp in the UPDATE.
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
  v_xp      int;
begin
  -- No session, nothing to record. Previously this ran to completion and
  -- handed an anonymous caller a fabricated streak of 1.
  if auth.uid() is null then
    return;
  end if;

  -- The largest legitimate award is 30 (a speaking mock). Above that is a
  -- caller inventing its own XP and spending it in unlock_test().
  v_xp := least(greatest(coalesce(p_xp, 0), 0), 30);

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
         xp = p.xp + v_xp
   where p.id = auth.uid();

  return query
    select v_streak, v_longest, (select p.xp from public.profiles p where p.id = auth.uid());
end;
$$;


-- ------------------------------------------------------------
-- 2. apply_rating — three fixes, body otherwise identical to 0016.
--
--    (i)   OWNERSHIP. It took any result id and rated it, using that row's
--          owner. A member could force-rate someone else's attempt.
--          auth.uid() IS NULL means the service role (rebuild_all_ratings,
--          SQL editor), which is still allowed.
--    (ii)  SKILL COMES FROM THE TEST. The old check read r.skill, which is
--          client-supplied via saveResult. A listening paper declared as
--          reading entered the reading ladder. Now both must agree.
--    (iii) A MISSING DURATION IS NOT A PASS. The old guard was
--          `if duration_seconds is not null and < floor`, so omitting the
--          field skipped the anti-cheat check entirely. Every rated reading
--          attempt comes from TestRunner, which always sends it.
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

  -- (i) You may only rate your own attempt. NULL uid = service role.
  if auth.uid() is not null
     and auth.uid() <> r.user_id
     and not public.is_admin(auth.uid()) then
    return query select false, null::int, 0, 0, false, 'not your result'; return;
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

  -- (ii) The test itself must agree that it is a reading paper.
  if t.skill <> 'reading' then
    return query select false, null::int, 0, 0, false, 'skill does not match the test'; return;
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
  -- (iii) An absent duration is treated as a failure to track, not a pass.
  v_min_seconds := greatest(20, v_total * 3);
  if r.duration_seconds is null then
    v_flagged := true;
    v_reason  := 'untracked duration';
  elsif r.duration_seconds < v_min_seconds then
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
-- 3. Revoke the default PUBLIC grant, then hand back only what the app calls.
-- ------------------------------------------------------------
revoke execute on function public.record_activity(int)          from public, anon;
revoke execute on function public.apply_rating(uuid)            from public, anon;
revoke execute on function public.grant_achievement(uuid, text) from public, anon, authenticated;
revoke execute on function public.recalc_test_difficulty(uuid)  from public, anon, authenticated;
revoke execute on function public.rebuild_all_ratings()         from public, anon, authenticated;

grant execute on function public.record_activity(int) to authenticated;
grant execute on function public.apply_rating(uuid)   to authenticated;


-- ------------------------------------------------------------
-- 4. One rated attempt per user per test, enforced by the database.
--    apply_rating counts prior attempts before it takes the profile lock, so
--    two concurrent submissions could both be rated. This makes that a
--    constraint violation instead of a corrupted standing.
--
--    If this index fails to build, there are already duplicates. Find them:
--      select user_id, test_id, count(*) from public.results
--       where rated group by 1,2 having count(*) > 1;
--    and un-rate the later row of each pair before re-running.
-- ------------------------------------------------------------
--    Checked against production before writing this: 90 rated rows, and the
--    only repeated pair is (user, NULL) from legacy rows that predate 0016.
--    `test_id is not null` in the predicate says so explicitly rather than
--    leaning on NULLs comparing as distinct.
create unique index if not exists results_one_rated_per_test
  on public.results (user_id, test_id)
  where rated and test_id is not null;
