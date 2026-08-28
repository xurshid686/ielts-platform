-- ============================================================
-- IELTS Platform — 0039: remove XP test-unlocks and the whole
--                        "My student" teaching system
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- DEPLOY ORDER — THIS ONE IS NOT BACKWARD COMPATIBLE.
--   Deploy the code that stops using these objects, CONFIRM IT IS LIVE,
--   and only then run this migration. Running it first breaks the live
--   site: resolveTestAccess() selects from `unlocks`, saveResult() calls
--   complete_assignments(), and /assignments + /feedback read tables this
--   drops. (Same hazard as 0034 — see its header.)
--
-- WHAT THIS DOES
--   1. Drops the per-test XP unlock mechanic: unlock_test() + `unlocks`
--      (0009). Premium is membership-only from here on. Anyone who had
--      unlocked a premium test with XP LOSES that test — they keep their
--      XP balance, which still drives streaks, badges and leaderboards.
--   2. Drops the teacher/"My student" system in full: assignments and
--      assignment_targets (0030), teacher_feedback (0032), the RPCs
--      set_my_student / start_assignment / complete_assignments /
--      my_students_leaderboard / admin_send_feedback (0029-0032), and the
--      profiles columns is_my_student (0029) + can_send_to_teacher (0027).
--   3. Re-emits the profile field guard from 0029 WITHOUT the two dropped
--      columns, so the trigger keeps protecting everything else.
--
-- THIS DESTROYS DATA. Every assignment, assignment target, teacher
-- feedback note and XP unlock row is gone for good. To keep a copy, run
-- this BEFORE the migration:
--   create table archive_unlocks            as table public.unlocks;
--   create table archive_assignments        as table public.assignments;
--   create table archive_assignment_targets as table public.assignment_targets;
--   create table archive_teacher_feedback   as table public.teacher_feedback;
--
-- ROLLBACK: re-run migrations 0009, 0029, 0030, 0031 and 0032 in order.
-- They are all `if not exists` / `create or replace`, so they rebuild the
-- schema — but the ROWS are not coming back without the archive above.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------- XP test unlocks
drop function if exists public.unlock_test(uuid);
drop table if exists public.unlocks cascade;

-- 2. ------------- teacher feedback (0032)
drop function if exists public.admin_send_feedback(uuid, text, uuid, text, text);
drop table if exists public.teacher_feedback cascade;

-- 3. ------------- assignments (0030, 0031)
drop function if exists public.my_students_leaderboard();
drop function if exists public.complete_assignments(text, uuid, uuid, uuid, uuid);
drop function if exists public.start_assignment(uuid);
drop table if exists public.assignment_targets cascade;
drop table if exists public.assignments cascade;

-- 4. ------------- the My-student flag itself (0029, 0027)
drop function if exists public.set_my_student(text, boolean);

-- Re-emit the 0029 guard without the two columns being dropped below.
-- Must run BEFORE the drops so the trigger is never left naming a column
-- that no longer exists.
-- SECURITY INVOKER (default) on purpose: we test current_user against the
-- real executing role. Do NOT add `security definer`.
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
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged on public.profiles;
create trigger trg_protect_profile_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

alter table public.profiles drop column if exists is_my_student;
alter table public.profiles drop column if exists can_send_to_teacher;

-- 5. ------------- dangling notifications that pointed at /feedback
delete from public.notifications where type = 'teacher_feedback';

-- ============================================================
-- VERIFY (optional):
--   select to_regclass('public.unlocks'),
--          to_regclass('public.assignments'),
--          to_regclass('public.assignment_targets'),
--          to_regclass('public.teacher_feedback');   -- all four null
--   select column_name from information_schema.columns
--    where table_name = 'profiles'
--      and column_name in ('is_my_student', 'can_send_to_teacher');  -- 0 rows
-- ============================================================
