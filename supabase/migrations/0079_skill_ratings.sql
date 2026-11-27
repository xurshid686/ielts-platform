-- 0079: skill ratings (owner, 2026-11-27). "Areas" = skills:
--   * Listening: the same Elo as Reading (apply_rating now branches on skill),
--     with every past first attempt REPLAYED once at the end of this file;
--   * Writing: from checked bands, the last 5 tasks (practice AI checks +
--     released mock grades), Task 2 counted twice, on the Reading scale
--     (band 5.0 = 1000, 9.0 = 2700, the inverse of estimatedBand in rating.ts);
--   * Overall: the average of the skills a student is rated in (not stored).
--
-- Reading ratings are NOT touched: the reading path of apply_rating is the
-- 0036 body unchanged, and the replay resets listening state only.
-- New leaderboard views: leaderboard_overall / _listening / _writing.
-- Verify with scripts/check-0079.mjs.

-- ------------------------------------------------------------------ columns
alter table public.profiles
  add column if not exists listening_rating      int not null default 1000,
  add column if not exists listening_peak        int not null default 1000,
  add column if not exists listening_rated_count int not null default 0,
  add column if not exists writing_rating        int not null default 1000,
  add column if not exists writing_peak          int not null default 1000,
  add column if not exists writing_rated_count   int not null default 0;

-- ------------------------------------------------------------------ guard (0075 + the new columns)
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role                 is distinct from old.role
       or new.is_owner             is distinct from old.is_owner
       or new.xp                   is distinct from old.xp
       or new.premium_until        is distinct from old.premium_until
       or new.streak               is distinct from old.streak
       or new.longest_streak       is distinct from old.longest_streak
       or new.last_activity_date   is distinct from old.last_activity_date
       or new.level                is distinct from old.level
       or new.rating               is distinct from old.rating
       or new.peak_rating          is distinct from old.peak_rating
       or new.rated_count          is distinct from old.rated_count
       or new.hidden_from_leaderboard is distinct from old.hidden_from_leaderboard
       -- 0079: skill ratings are written only by apply_rating / recompute_writing_rating.
       or new.listening_rating      is distinct from old.listening_rating
       or new.listening_peak        is distinct from old.listening_peak
       or new.listening_rated_count is distinct from old.listening_rated_count
       or new.writing_rating        is distinct from old.writing_rating
       or new.writing_peak          is distinct from old.writing_peak
       or new.writing_rated_count   is distinct from old.writing_rated_count
       or new.unsubscribe_token    is distinct from old.unsubscribe_token
       or new.email                is distinct from old.email
       or new.id                   is distinct from old.id
       or (new.premium_announce is distinct from old.premium_announce
           and new.premium_announce is not false)
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;

    if new.avatar_url is distinct from old.avatar_url
       and new.avatar_url is not null
       and new.avatar_url not like '/api/avatar/' || new.id::text || '%' then
      raise exception 'Invalid avatar.' using errcode = '22023';
    end if;

    if new.name is distinct from old.name
       and new.name is not null
       and (length(new.name) > 80 or new.name ~ '[[:cntrl:]]') then
      raise exception 'Invalid name.' using errcode = '22023';
    end if;

    if new.timezone is distinct from old.timezone
       and new.timezone is not null
       and not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
      raise exception 'Unknown time zone.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ overall
-- Writing counts (Overall, leaderboards) only from 3 checked essays: two
-- essays are too little evidence, and September's test gradings (9.0/9.0) were
-- exactly two per account.
create or replace function public.overall_rating(r int, rc int, l int, lc int, w int, wc int)
returns int
language sql
immutable
as $fn$
  select case when n = 0 then null else round(total::numeric / n)::int end
  from (select (case when rc > 0 then r else 0 end + case when lc > 0 then l else 0 end + case when wc >= 3 then w else 0 end) as total,
               ((rc > 0)::int + (lc > 0)::int + (wc >= 3)::int) as n) x
$fn$;

create or replace function public.skills_rated(rc int, lc int, wc int)
returns int
language sql
immutable
as $fn$ select (rc > 0)::int + (lc > 0)::int + (wc >= 3)::int $fn$;

-- ------------------------------------------------------------------ difficulty (0016, per skill)
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
  v_skill text;
begin
  select skill into v_skill from public.tests where id = p_test_id;
  -- One (earliest) attempt per user, of this test's own skill.
  with firsts as (
    select distinct on (user_id)
      least(1.0, greatest(0.0, coalesce(raw,0)::double precision / greatest(coalesce(total,1),1))) as acc
    from public.results
    where test_id = p_test_id and skill = v_skill and total > 0
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

-- ------------------------------------------------------------------ apply_rating (0036 + listening)
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

  -- 0079: READING and LISTENING attempts on a real, server-graded test.
  if r.skill not in ('reading', 'listening') or r.test_id is null then
    return query select false, null::int, 0, 0, false, 'not a rated skill'; return;
  end if;

  select * into t from public.tests where id = r.test_id;
  if not found or t.answer_key is null then
    -- Keyless tests can be faked client-side -> never rated.
    return query select false, null::int, 0, 0, false, 'test has no answer key'; return;
  end if;

  -- (ii) The test itself must agree with the result's skill.
  if t.skill <> r.skill then
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
  v_min_seconds := greatest(20, v_total * 3);
  if r.duration_seconds is null then
    v_flagged := true;
    v_reason  := 'untracked duration';
  elsif r.duration_seconds < v_min_seconds then
    v_flagged := true;
    v_reason  := 'completed too fast (' || r.duration_seconds || 's < ' || v_min_seconds || 's)';
  end if;

  -- (C) DAILY FARM CAP: at most 15 rated tests per UTC day (shared by both skills).
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

  -- ---- Standing snapshot (this skill's ladder) ----
  if r.skill = 'listening' then
    select pr.listening_rating, pr.listening_peak, pr.listening_rated_count
      into v_rating, v_peak, v_count
    from public.profiles pr where pr.id = v_uid for update;
  else
    select pr.rating, pr.peak_rating, pr.rated_count
      into v_rating, v_peak, v_count
    from public.profiles pr where pr.id = v_uid for update;
  end if;
  v_rating := coalesce(v_rating, 1000);
  v_peak   := coalesce(v_peak, v_rating);
  v_count  := coalesce(v_count, 0);

  -- ---- Elo delta ----
  v_expected := public.rating_expected(v_rating, t.difficulty);
  v_k        := public.rating_kfactor(v_rating, v_count);
  v_delta    := round(v_k * (v_acc - v_expected));

  -- ---- Consistency reward (applied to GAINS only), same skill ----
  select avg(x.acc) into v_recent_acc from (
    select least(1.0, greatest(0.0, coalesce(res.raw,0)::double precision / greatest(coalesce(res.total,1),1))) as acc
    from public.results res
    where res.user_id = v_uid and res.rated and res.skill = r.skill
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

  -- ---- Weekly/monthly POINTS ----
  v_points := greatest(1, round(
    power(v_acc, 1.5) * 100.0 * least(1.8, greatest(0.6, t.difficulty / 1500.0))
  ));

  update public.results
    set rated = true,
        points = v_points,
        rating_before = v_rating,
        rating_after  = v_rating + v_delta,
        rating_delta  = v_delta
    where id = r.id;

  if r.skill = 'listening' then
    update public.profiles
      set listening_rating      = v_rating + v_delta,
          listening_peak        = greatest(v_peak, v_rating + v_delta),
          listening_rated_count = v_count + 1
      where id = v_uid;
  else
    update public.profiles
      set rating      = v_rating + v_delta,
          peak_rating = greatest(v_peak, v_rating + v_delta),
          rated_count = v_count + 1
      where id = v_uid;
  end if;
  v_rating := v_rating + v_delta;

  perform public.recalc_test_difficulty(r.test_id);

  -- ---- Achievements stay on the Reading ladder (0016) ----
  if r.skill = 'reading' then
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
  end if;

  return query select true, v_rating, v_delta, v_points, false, null::text;
end;
$$;

-- ------------------------------------------------------------------ listening replay
create or replace function public.rebuild_listening_ratings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  n int := 0;
begin
  update public.profiles set listening_rating = 1000, listening_peak = 1000, listening_rated_count = 0
   where listening_rated_count <> 0 or listening_rating <> 1000 or listening_peak <> 1000;
  update public.results set rated = false, points = 0, rating_before = null,
         rating_after = null, rating_delta = null, flagged = false, flag_reason = null
   where skill = 'listening';
  update public.tests set difficulty = 1500 where skill = 'listening';
  for rec in
    select id from public.results where skill = 'listening' order by submitted_at asc, id asc
  loop
    perform public.apply_rating(rec.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ------------------------------------------------------------------ writing
-- Band -> rating on the Reading scale: 5.0 = 1000, 9.0 = 2700 (rating.ts estimatedBand, inverted).
create or replace function public.writing_band_to_rating(p_band numeric)
returns int
language sql
immutable
as $fn$ select greatest(0, least(3000, round(1000 + (p_band - 5) * 425)))::int $fn$;

-- Mock writing released before this date doesn't count (owner, 2026-11-27): the
-- 14-17 September gradings were tests while the mock section was being built.
create or replace function public.writing_rating_mock_cutoff()
returns timestamptz
language sql
immutable
as $fn$ select timestamptz '2026-09-18 00:00:00+05' $fn$;

create or replace function public.recompute_writing_rating(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_n int;
  v_rating int;
begin
  with items as (
    -- Practice essays checked by AI (one row per task in the check).
    select (e->>'task')::int as task, (e->>'overall')::numeric as band,
           coalesce(c.finished_at, c.created_at) as at
      from public.writing_ai_checks c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.results) = 'array' then c.results else '[]'::jsonb end) e
     where c.user_id = p_user and c.source = 'practice' and c.status = 'done'
       and (e->>'overall') ~ '^[0-9]+(\.[0-9]+)?$'
    union all
    -- Mock writing graded by a teacher, once released to the student.
    select 1, m.writing_task1_band, coalesce(m.released_at, m.submitted_at)
      from public.mock_attempts m
     where m.user_id = p_user and m.released_at >= public.writing_rating_mock_cutoff() and m.writing_task1_band is not null
    union all
    select 2, m.writing_task2_band, coalesce(m.released_at, m.submitted_at)
      from public.mock_attempts m
     where m.user_id = p_user and m.released_at >= public.writing_rating_mock_cutoff() and m.writing_task2_band is not null
  ), last5 as (
    select * from items order by at desc limit 5
  )
  select (select sum(band * case when task = 2 then 2 else 1 end)
                 / nullif(sum(case when task = 2 then 2 else 1 end), 0) from last5),
         (select count(*) from items)
    into v_avg, v_n;

  if v_n = 0 or v_avg is null then
    update public.profiles set writing_rating = 1000, writing_peak = 1000, writing_rated_count = 0
     where id = p_user and writing_rated_count <> 0;
    return null;
  end if;

  v_rating := public.writing_band_to_rating(v_avg);
  update public.profiles
     set writing_rating = v_rating,
         writing_peak = case when writing_rated_count = 0 then v_rating else greatest(writing_peak, v_rating) end,
         writing_rated_count = v_n
   where id = p_user;
  return v_rating;
end;
$$;

create or replace function public.trg_writing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    perform public.recompute_writing_rating(new.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists writing_rating_from_ai on public.writing_ai_checks;
create trigger writing_rating_from_ai
  after insert or update of status, results on public.writing_ai_checks
  for each row when (new.status = 'done' and new.source = 'practice')
  execute function public.trg_writing_rating();

drop trigger if exists writing_rating_from_mock on public.mock_attempts;
create trigger writing_rating_from_mock
  after update of released_at, writing_task1_band, writing_task2_band on public.mock_attempts
  for each row
  execute function public.trg_writing_rating();

-- ------------------------------------------------------------------ leaderboards
create or replace view public.leaderboard_listening as
  select p.id, p.name, p.avatar_url,
         p.listening_rating as rating, p.listening_peak as peak_rating, p.listening_rated_count as rated_count,
         (select count(*) from public.results r where r.user_id = p.id and r.skill = 'listening') as tests_completed,
         rank() over (order by p.listening_rating desc, p.listening_rated_count desc) as rank
    from public.profiles p
   where p.listening_rated_count > 0 and not p.hidden_from_leaderboard;

create or replace view public.leaderboard_writing as
  select p.id, p.name, p.avatar_url,
         p.writing_rating as rating, p.writing_peak as peak_rating, p.writing_rated_count as rated_count,
         p.writing_rated_count::bigint as tests_completed,
         rank() over (order by p.writing_rating desc, p.writing_rated_count desc) as rank
    from public.profiles p
   where p.writing_rated_count >= 3 and not p.hidden_from_leaderboard;

create or replace view public.leaderboard_overall as
  select x.*, rank() over (order by x.rating desc, x.skills desc, x.rated_count desc) as rank
    from (
      select p.id, p.name, p.avatar_url,
             public.overall_rating(p.rating, p.rated_count, p.listening_rating, p.listening_rated_count,
                                   p.writing_rating, p.writing_rated_count) as rating,
             public.skills_rated(p.rated_count, p.listening_rated_count, p.writing_rated_count) as skills,
             (p.rated_count + p.listening_rated_count + p.writing_rated_count) as rated_count,
             (select count(*) from public.results r where r.user_id = p.id) as tests_completed
        from public.profiles p
       where (p.rated_count > 0 or p.listening_rated_count > 0 or p.writing_rated_count >= 3)
         and not p.hidden_from_leaderboard
    ) x;

revoke all on public.leaderboard_listening, public.leaderboard_writing, public.leaderboard_overall from anon, public;
grant select on public.leaderboard_listening, public.leaderboard_writing, public.leaderboard_overall to authenticated, service_role;

-- ------------------------------------------------------------------ group leaderboard (0078, rating = Overall)
create or replace function public.friends_group_leaderboard(p_kind text default 'weekly')
returns table (group_id uuid, name text, members int, score int, rank bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  with g as (
    select g.id, public.friends_group_name(g.id) as name,
           (select count(*) from public.premium_group_members m where m.group_id = g.id)::int as members
      from public.premium_groups g
     where g.expires_at > now() and not g.hidden_from_leaderboard
  ), s as (
    select g.id, g.name, g.members,
           case when p_kind = 'rating' then
             (select round(avg(coalesce(public.overall_rating(p.rating, p.rated_count, p.listening_rating,
                       p.listening_rated_count, p.writing_rating, p.writing_rated_count), 1000)))::int
                from public.premium_group_members m
                join public.profiles p on p.id = m.user_id where m.group_id = g.id)
           else
             (select coalesce(round(sum(r.points)::numeric / g.members), 0)::int
                from public.results r
                join public.premium_group_members m on m.user_id = r.user_id and m.group_id = g.id
               where r.rated and r.submitted_at >= public.friends_week_start())
           end as score
      from g where g.members >= 2
  )
  select s.id, s.name, s.members, s.score, rank() over (order by s.score desc, s.members desc)
    from s
   order by 5, 2
$fn$;
revoke all on function public.friends_group_leaderboard(text) from public, anon;
grant execute on function public.friends_group_leaderboard(text) to authenticated, service_role;

-- ------------------------------------------------------------------ public profile (0078 + skills)
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
    ), '[]'::jsonb),
    -- 0078: streak (made live in the app with the timezone) and this week's points.
    'streak',             p.streak,
    'last_activity_date', p.last_activity_date,
    'timezone',           p.timezone,
    'weekly_points', (select coalesce(sum(r.points), 0)::int from public.results r
                       where r.user_id = p.id and r.rated
                         and r.submitted_at >= public.friends_week_start()),
    -- 0079: skill ratings + Overall.
    'listening_rating',      p.listening_rating,
    'listening_peak',        p.listening_peak,
    'listening_rated_count', p.listening_rated_count,
    'writing_rating',        p.writing_rating,
    'writing_peak',          p.writing_peak,
    'writing_rated_count',   p.writing_rated_count,
    'overall_rating', public.overall_rating(p.rating, p.rated_count, p.listening_rating, p.listening_rated_count,
                                            p.writing_rating, p.writing_rated_count),
    'skills_rated',   public.skills_rated(p.rated_count, p.listening_rated_count, p.writing_rated_count),
    'overall_rank',   (select o.rank from public.leaderboard_overall o where o.id = p.id)
  )
  from public.profiles p
  where p.id = p_id;
$$;

grant execute on function public.public_profile(uuid) to anon, authenticated;

-- ------------------------------------------------------------------ grants
revoke all on function public.rebuild_listening_ratings() from public, anon, authenticated;
revoke all on function public.recompute_writing_rating(uuid) from public, anon, authenticated;
revoke all on function public.trg_writing_rating() from public, anon, authenticated;
grant execute on function public.rebuild_listening_ratings() to service_role;
grant execute on function public.recompute_writing_rating(uuid) to service_role;
grant execute on function public.overall_rating(int, int, int, int, int, int) to anon, authenticated, service_role;
grant execute on function public.skills_rated(int, int, int) to anon, authenticated, service_role;
revoke execute on function public.recalc_test_difficulty(uuid) from public, anon, authenticated;
revoke execute on function public.apply_rating(uuid) from public, anon;
grant execute on function public.apply_rating(uuid) to authenticated;

-- ------------------------------------------------------------------ backfill
select public.rebuild_listening_ratings();
select public.recompute_writing_rating(u.user_id)
  from (select distinct user_id from public.writing_ai_checks where source = 'practice' and status = 'done'
        union
        select distinct user_id from public.mock_attempts where released_at is not null
          and (writing_task1_band is not null or writing_task2_band is not null)) u
 where u.user_id is not null;
