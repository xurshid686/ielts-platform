-- ============================================================
-- IELTS Platform — 0062: Fewer reminder emails
-- Apply with: node scripts/apply-migration.mjs supabase/migrations/0062_fewer_reminders.sql
-- Safe to re-run (idempotent).
-- ============================================================
-- Owner decision (2026-11-11, the same day as 0061): 0061 sent too many
-- emails. Two changes:
--
--   • The "never started" nudges (1 and 3 days after sign-up) are GONE.
--     Instead ONE email goes out when a student has done nothing for exactly
--     14 days: either they never started and signed up 14 days ago, or their
--     last activity was 14 days ago. It fires once per quiet spell, because
--     the day count only equals 14 on one day.
--   • Streak EMAILS only go to streaks of 10 days or more. That threshold is
--     in the app (STREAK_EMAIL_MIN), not here: cron_streak_reminders() still
--     posts the in-app notification for every live streak.
--
-- cron_never_started() is dropped. Nothing live ever called it: 0061's code
-- had only reached the dev preview.
-- ============================================================

set check_function_bodies = off;

drop function if exists public.cron_never_started();

-- 'inactive' joins the allowed kinds. 'never_started' stays in the list so
-- the constraint never has to care whether an old row exists.
alter table public.reminder_log drop constraint if exists reminder_log_kind_check;
alter table public.reminder_log add constraint reminder_log_kind_check
  check (kind in ('streak', 'never_started', 'inactive', 'weekly_report', 'premium_expiring'));

create or replace function public.cron_inactive()
returns table (
  user_id           uuid,
  email             text,
  name              text,
  ever_practised    boolean,
  unsubscribe_token uuid
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.name,
         p.last_activity_date is not null,
         p.unsubscribe_token
    from public.profiles p
   where p.email_reminders
     and p.email is not null
     and p.role <> 'admin'
     -- Quiet for exactly 14 local days, counted from the last activity, or
     -- from sign-up for someone who has never done anything.
     and (now() at time zone coalesce(p.timezone, 'UTC'))::date
           - coalesce(p.last_activity_date,
                      (p.created_at at time zone coalesce(p.timezone, 'UTC'))::date) = 14
     -- last_activity_date is written by record_activity_for(); these guard the
     -- paths that might not go through it.
     and not exists (
       select 1 from public.results res
        where res.user_id = p.id and res.submitted_at > now() - interval '13 days')
     and not exists (
       select 1 from public.speaking_submissions ss
        where ss.user_id = p.id and ss.created_at > now() - interval '13 days')
     and not exists (
       select 1 from public.writing_practice_attempts w
        where w.user_id = p.id and w.started_at > now() - interval '13 days');
$$;

revoke execute on function public.cron_inactive() from public, anon, authenticated;
grant  execute on function public.cron_inactive() to service_role;

-- ============================================================
-- VERIFY (read-only):
--   select ever_practised, count(*) from public.cron_inactive() group by 1;
-- ============================================================
