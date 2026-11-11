-- ============================================================
-- IELTS Platform — 0061: Email reminders
-- Apply with: node scripts/apply-migration.mjs supabase/migrations/0061_email_reminders.sql
-- Safe to re-run (idempotent). ADDITIVE: safe before the code is live.
-- ============================================================
-- Owner decision (2026-11-11): reminders leave the site by EMAIL — the bell
-- reaches nobody (19,880 of 20,295 notifications unread). Four kinds: streak
-- about to break, never started, weekly report, Premium expiring. At most ONE
-- email per student per day.
--
-- WHAT THIS ADDS
--   • profiles.email_reminders   — the student's own on/off switch.
--   • profiles.unsubscribe_token — the secret in the unsubscribe link, so the
--     link works signed-out. Guarded: a student cannot change it.
--   • reminder_log               — one row per email. UNIQUE (user_id, sent_day)
--     IS the one-a-day rule: the sender inserts first and a conflict means
--     "already emailed today". No grants, no policies (service role only).
--   • cron_streak_reminders()    — now requires a LIVE streak (last activity
--     was yesterday in the student's zone). It used to test `streak > 0`, which
--     nudged ~547 accounts whose streak had died weeks ago.
--   • cron_never_started(), cron_premium_expiring() — new candidate lists.
--   • cron_weekly_reports(date)  — same work, now also returns the email flag
--     and token.
--
-- The older build calls the two existing cron functions and reads only the row
-- COUNT, so the wider return types do not break it.
-- ============================================================

set check_function_bodies = off;

-- ------------------------------------------------------------
-- 1. Profile columns
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists email_reminders boolean not null default true;

alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

-- Re-emit the 0039 guard with unsubscribe_token added. email_reminders is
-- deliberately NOT listed: it is the student's own preference.
-- SECURITY INVOKER (default) on purpose — see 0039.
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
       or new.referral_code        is distinct from old.referral_code
       or new.referred_by          is distinct from old.referred_by
       or new.hidden_from_leaderboard is distinct from old.hidden_from_leaderboard
       or new.unsubscribe_token    is distinct from old.unsubscribe_token
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. The send log
-- ------------------------------------------------------------
create table if not exists public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('streak', 'never_started', 'weekly_report', 'premium_expiring')),
  sent_day   date not null,                      -- UTC day of the cron run
  to_email   text not null,
  status     text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  resend_id  text,
  error      text,
  created_at timestamptz not null default now(),
  unique (user_id, sent_day)
);

create index if not exists reminder_log_day_idx on public.reminder_log (sent_day);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Streak reminders — live streaks only
-- ------------------------------------------------------------
drop function if exists public.cron_streak_reminders();

create function public.cron_streak_reminders()
returns table (
  user_id           uuid,
  email             text,
  name              text,
  streak            int,
  email_reminders   boolean,
  unsubscribe_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select p.id as uid, p.email, p.name, p.streak, p.email_reminders, p.unsubscribe_token,
           coalesce(p.timezone, 'UTC') as tz
      from public.profiles p
     where coalesce(p.streak, 0) > 0
       -- LIVE: the last activity was yesterday in their own zone. Today means
       -- they already practised; anything older means the streak is dead.
       and p.last_activity_date = (now() at time zone coalesce(p.timezone, 'UTC'))::date - 1
  loop
    if exists (
      select 1 from public.results res
       where res.user_id = r.uid
         and (res.submitted_at at time zone r.tz)::date = (now() at time zone r.tz)::date
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.speaking_submissions ss
       where ss.user_id = r.uid
         and (ss.created_at at time zone r.tz)::date = (now() at time zone r.tz)::date
    ) then
      continue;
    end if;
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

    return query select r.uid, r.email, r.name, r.streak, r.email_reminders, r.unsubscribe_token;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4. Never started — signed up 1 or 3 local days ago, nothing submitted
-- ------------------------------------------------------------
create or replace function public.cron_never_started()
returns table (
  user_id           uuid,
  email             text,
  name              text,
  days_since        int,
  unsubscribe_token uuid
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.name,
         ((now() at time zone coalesce(p.timezone, 'UTC'))::date
           - (p.created_at at time zone coalesce(p.timezone, 'UTC'))::date)::int,
         p.unsubscribe_token
    from public.profiles p
   where p.email_reminders
     and p.email is not null
     and p.role <> 'admin'
     and ((now() at time zone coalesce(p.timezone, 'UTC'))::date
           - (p.created_at at time zone coalesce(p.timezone, 'UTC'))::date) in (1, 3)
     and not exists (select 1 from public.results res where res.user_id = p.id)
     and not exists (select 1 from public.speaking_submissions ss where ss.user_id = p.id)
     and not exists (select 1 from public.writing_practice_attempts w where w.user_id = p.id);
$$;

-- ------------------------------------------------------------
-- 5. Premium expiring — 3 days before the end, and the day after it
-- ------------------------------------------------------------
create or replace function public.cron_premium_expiring()
returns table (
  user_id           uuid,
  email             text,
  name              text,
  stage             text,          -- 'before' | 'after'
  premium_until     timestamptz,
  unsubscribe_token uuid
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.name,
         case when (p.premium_until at time zone coalesce(p.timezone, 'UTC'))::date
                   > (now() at time zone coalesce(p.timezone, 'UTC'))::date
              then 'before' else 'after' end,
         p.premium_until,
         p.unsubscribe_token
    from public.profiles p
   where p.email_reminders
     and p.email is not null
     and p.role <> 'admin'
     and p.premium_until is not null
     and ((p.premium_until at time zone coalesce(p.timezone, 'UTC'))::date
           - (now() at time zone coalesce(p.timezone, 'UTC'))::date) in (3, -1);
$$;

-- ------------------------------------------------------------
-- 6. Weekly reports — unchanged work, wider return
-- ------------------------------------------------------------
drop function if exists public.cron_weekly_reports(date);

create function public.cron_weekly_reports(p_week date default null)
returns table (
  user_id           uuid,
  email             text,
  name              text,
  tests             int,
  avg_band          numeric,
  best_band         numeric,
  report_id         uuid,
  emailed_period    date,
  rating_delta      int,
  email_reminders   boolean,
  unsubscribe_token uuid
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
             wr.id, v_period, wr.rating_delta::int,
             p.email_reminders, p.unsubscribe_token
        from public.weekly_reports wr
        join public.profiles p on p.id = wr.user_id
       where wr.id = v_report;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 7. EXECUTE grants — service_role only
-- ------------------------------------------------------------
revoke execute on function public.cron_weekly_reports(date)  from public, anon, authenticated;
revoke execute on function public.cron_streak_reminders()    from public, anon, authenticated;
revoke execute on function public.cron_never_started()       from public, anon, authenticated;
revoke execute on function public.cron_premium_expiring()    from public, anon, authenticated;
grant  execute on function public.cron_weekly_reports(date)  to service_role;
grant  execute on function public.cron_streak_reminders()    to service_role;
grant  execute on function public.cron_never_started()       to service_role;
grant  execute on function public.cron_premium_expiring()    to service_role;

-- ============================================================
-- VERIFY (read-only):
--   select count(*) from public.cron_never_started();
--   select count(*) from public.cron_premium_expiring();
--   -- cron_streak_reminders() and cron_weekly_reports() WRITE (notifications /
--   -- reports); count their candidates with a plain select instead:
--   select count(*) from public.profiles p
--    where coalesce(p.streak,0) > 0
--      and p.last_activity_date = (now() at time zone coalesce(p.timezone,'UTC'))::date - 1;
-- ============================================================
