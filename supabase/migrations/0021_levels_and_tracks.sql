-- ============================================================
-- IELTS Platform — 0021: student levels + per-level test tracks
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
-- 1. profiles.level — each student is in exactly ONE track:
--      'regular'   (default — full IELTS, what every existing user is)
--      'pre_ielts' (foundation students)
--      'intro'     (IELTS introduction students)
--    Admins move students between levels as they progress.
-- 2. set_user_level() — admin-only, trusted setter (mirrors set_premium).
-- 3. level is added to the privileged-field guard so students can't
--    self-assign a level via the public REST API.
-- 4. tests.track — which audience a reading/listening test is FOR:
--      'regular'   shows on the normal /reading & /listening pages
--      'pre_ielts' shows only in the Pre-IELTS menu, to Pre-IELTS students
--      'intro'     shows only in the Introduction menu, to Intro students
--    (Access is gated app-side in the test pages + /api/test-html, the same
--     way premium is — non-matching students never get the file_url.)
-- ============================================================

set check_function_bodies = off;

-- 1. -------------------------------------------------------- profile level
alter table public.profiles
  add column if not exists level text not null default 'regular';

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles
  add constraint profiles_level_check
  check (level in ('regular', 'pre_ielts', 'intro'));

-- 2. ----------------------------------------------- admin-only level setter
create or replace function public.set_user_level(target_email text, new_level text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  updated_email text;
begin
  if new_level not in ('regular', 'pre_ielts', 'intro') then
    raise exception 'Invalid level: %', new_level using errcode = '22023';
  end if;

  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may set a student level.' using errcode = '42501';
  end if;

  update profiles
     set level = new_level
   where lower(email) = lower(trim(target_email))
   returning email into updated_email;

  if updated_email is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  return new_level;
end;
$$;

revoke all on function public.set_user_level(text, text) from public, anon;
grant execute on function public.set_user_level(text, text) to authenticated;

-- 3. ------------------------------------ block self-escalation of `level`
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
       or new.level             is distinct from old.level
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

-- 4. ------------------------------------------------ test audience / track
alter table public.tests
  add column if not exists track text not null default 'regular';

alter table public.tests drop constraint if exists tests_track_check;
alter table public.tests
  add constraint tests_track_check
  check (track in ('regular', 'pre_ielts', 'intro'));

create index if not exists tests_track_skill_idx on public.tests (track, skill);

-- ============================================================
-- VERIFY (optional):
--   select level, count(*) from public.profiles group by level;
--   select track, skill, count(*) from public.tests group by track, skill;
--   -- as a non-admin this must FAIL:
--   select public.set_user_level('someone@example.com', 'pre_ielts');
-- ============================================================
