-- ============================================================
-- IELTS Platform — 0029: "My student" status + retire 'speaking_only'
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS DOES
--   * Adds profiles.is_my_student — the teacher's hand-picked students.
--     A My-student keeps full access to every section AND their normal
--     learning track; they just gain extras (send answers to teacher,
--     assignments, private progress tracking). It IMPLIES send-to-teacher,
--     so the legacy can_send_to_teacher (0027) is backfilled and kept in
--     sync but no longer read by the app.
--   * Removes the 'speaking_only' RESTRICTION level entirely. Any such
--     students are moved back to 'regular' (they lose nothing — they now
--     see the whole app). The level check + admin setter drop the value.
--   * Guards is_my_student so a student can't self-promote via the REST API.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------ the My-student flag
alter table public.profiles
  add column if not exists is_my_student boolean not null default false;

-- Backfill so nobody who already had "send to teacher" loses it.
update public.profiles
   set is_my_student = true
 where can_send_to_teacher = true
   and is_my_student = false;

-- 2. ------------------------------- retire the 'speaking_only' level
-- Move affected students off the dead value BEFORE re-tightening the check.
update public.profiles set level = 'regular' where level = 'speaking_only';

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles
  add constraint profiles_level_check
  check (level in ('regular', 'pre_ielts', 'intro'));

-- 3. ------------- drop 'speaking_only' from the admin-only level setter
--    (reverts 0024's body to the 0021 list of valid levels).
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

-- 4. -------------------- admin-only toggle for My-student status
--    Mirrors set_leaderboard_hidden (0020). Keeps the legacy
--    can_send_to_teacher column in sync so the old flag never disagrees.
create or replace function public.set_my_student(target_email text, flag boolean)
returns table (id uuid, email text, name text, is_my_student boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_id     uuid;
begin
  if not public.is_admin(v_caller) then
    raise exception 'Only admins can change My-student status';
  end if;

  select p.id into v_id from public.profiles p
  where lower(p.email) = lower(btrim(target_email));
  if v_id is null then raise exception 'No account found with that email'; end if;

  update public.profiles
     set is_my_student       = coalesce(flag, false),
         can_send_to_teacher = coalesce(flag, false)
   where id = v_id;

  return query
    select p.id, p.email, p.name, p.is_my_student
    from public.profiles p where p.id = v_id;
end;
$$;

grant execute on function public.set_my_student(text, boolean) to authenticated;

-- 5. ------------- guard is_my_student against self-promotion
--    Re-emit the authoritative guard from 0023, adding is_my_student.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
-- SECURITY INVOKER (default) on purpose: we test current_user against the real
-- executing role. Do NOT add `security definer`.
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
       or new.is_my_student        is distinct from old.is_my_student
       or new.can_send_to_teacher  is distinct from old.can_send_to_teacher
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

-- ============================================================
-- VERIFY (optional):
--   select is_my_student, count(*) from public.profiles group by is_my_student;
--   select level, count(*) from public.profiles group by level; -- no 'speaking_only'
--   -- as a non-admin this must FAIL:
--   select public.set_my_student('someone@example.com', true);
-- ============================================================
